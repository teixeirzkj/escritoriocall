import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { serverAbly } from "@/lib/env";
import { handleRouteError } from "@/lib/http";
import {
  type MusicEvent,
  type MusicItem,
  type MusicState,
  musicPositionMs,
  parseMusicUrl,
} from "@/lib/music";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_QUEUE = 30;
const ids = z.object({ officeId: z.uuid(), roomId: z.uuid() });

function asState(v: unknown): MusicState | null {
  if (!v || typeof v !== "object") return null;
  const s = v as MusicState;
  return typeof s.url === "string" && typeof s.startedAt === "number" ? s : null;
}

/** Estado atual da caixa de som da sala. */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const input = ids.parse({
      officeId: req.nextUrl.searchParams.get("officeId") ?? undefined,
      roomId: req.nextUrl.searchParams.get("roomId") ?? undefined,
    });
    await assertOfficeMember(supabase, input.officeId, user.id);
    const room = await assertRoomAccess(supabase, input.officeId, input.roomId);
    const body: MusicEvent = { state: asState((room as unknown as { music?: unknown }).music), serverNow: Date.now() };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}

const action = z.intersection(
  ids,
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("play"), url: z.string().trim().min(8).max(500) }),
    z.object({ action: z.literal("add"), url: z.string().trim().min(8).max(500) }),
    z.object({ action: z.literal("pause") }),
    z.object({ action: z.literal("resume") }),
    z.object({ action: z.literal("stop") }),
    z.object({ action: z.literal("next") }),
    z.object({ action: z.literal("remove"), index: z.number().int().min(0).max(MAX_QUEUE) }),
    z.object({ action: z.literal("loop"), mode: z.enum(["off", "one", "all"]) }),
    // Enviado pelos navegadores quando a música acaba; só avança uma vez (confere o startedAt).
    z.object({ action: z.literal("ended"), startedAt: z.number() }),
  ]),
);

async function youtubeTitle(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: unknown };
    return typeof j.title === "string" ? j.title.slice(0, 140) : null;
  } catch {
    return null;
  }
}

async function toItem(url: string, by: string): Promise<MusicItem> {
  const parsed = parseMusicUrl(url);
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  return {
    url: parsed.url,
    kind: parsed.kind,
    videoId: parsed.kind === "youtube" ? parsed.videoId : null,
    title:
      parsed.kind === "youtube"
        ? await youtubeTitle(parsed.url)
        : decodeURIComponent(parsed.url.split("/").pop() ?? "").slice(0, 140),
    by,
  };
}

function startItem(item: MusicItem, now: number, queue: MusicItem[], loop: MusicState["loop"]): MusicState {
  return { ...item, startedAt: now, offsetMs: 0, paused: false, queue, loop: loop ?? "off" };
}

const itemOf = (s: MusicState): MusicItem => ({ url: s.url, kind: s.kind, videoId: s.videoId, title: s.title, by: s.by });

/** Próxima música (respeitando o modo de repetição). */
function advance(cur: MusicState, now: number): MusicState | null {
  const loop = cur.loop ?? "off";
  if (loop === "one") return startItem(itemOf(cur), now, cur.queue ?? [], loop);
  const queue = [...(cur.queue ?? [])];
  if (loop === "all") queue.push(itemOf(cur));
  const next = queue.shift();
  return next ? startItem(next, now, queue, loop) : null;
}

/** Controle da caixa de som. Qualquer pessoa com acesso à sala controla. */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`music:${user.id}`, 15, 10_000);
    if (!rl.ok) throw new HttpError(429, `Calma! Aguarde ${rl.retryAfter}s.`);
    serverAbly();

    const input = action.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    const room = await assertRoomAccess(supabase, input.officeId, input.roomId);
    const current = asState((room as unknown as { music?: unknown }).music);

    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    const by = (profile?.display_name as string | undefined) ?? "Alguém";
    const now = Date.now();

    let next: MusicState | null = current;
    switch (input.action) {
      case "play":
        next = startItem(await toItem(input.url, by), now, current?.queue ?? [], current?.loop);
        break;
      case "add": {
        const item = await toItem(input.url, by);
        if (!current) next = startItem(item, now, [], "off");
        else {
          if ((current.queue?.length ?? 0) >= MAX_QUEUE) throw new HttpError(400, `A fila já tem ${MAX_QUEUE} músicas.`);
          next = { ...current, queue: [...(current.queue ?? []), item] };
        }
        break;
      }
      case "stop":
        next = null;
        break;
      case "next":
        if (!current) throw new HttpError(409, "Nada tocando nesta sala");
        next = advance({ ...current, loop: current.loop === "one" ? "off" : current.loop }, now);
        if (next && current.loop === "one") next.loop = "one";
        break;
      case "ended":
        if (!current || current.startedAt !== input.startedAt || current.paused) {
          return NextResponse.json({ state: current, serverNow: now, skipped: true });
        }
        next = advance(current, now);
        break;
      case "remove": {
        if (!current) throw new HttpError(409, "Nada tocando nesta sala");
        const queue = [...(current.queue ?? [])];
        queue.splice(input.index, 1);
        next = { ...current, queue };
        break;
      }
      case "loop":
        if (!current) throw new HttpError(409, "Nada tocando nesta sala");
        next = { ...current, loop: input.mode };
        break;
      case "pause":
        if (!current) throw new HttpError(409, "Nada tocando nesta sala");
        if (!current.paused) next = { ...current, offsetMs: musicPositionMs(current, now), paused: true, startedAt: now, by };
        break;
      case "resume":
        if (!current) throw new HttpError(409, "Nada tocando nesta sala");
        if (current.paused) next = { ...current, startedAt: now, paused: false, by };
        break;
    }

    const { error } = await supabaseAdmin().from("rooms").update({ music: next }).eq("id", input.roomId);
    if (error) throw error;
    const event: MusicEvent = { state: next, serverNow: Date.now() };
    await publishServer(ch.room(input.officeId, input.roomId), "music", event);
    return NextResponse.json(event, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}
