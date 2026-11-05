import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { serverAbly } from "@/lib/env";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import type { ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

const SELECT = "id, office_id, room_id, recipient_id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey(display_name, avatar_config)";

const scopeSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("office"), officeId: z.uuid() }),
  z.object({ scope: z.literal("room"), officeId: z.uuid(), roomId: z.uuid() }),
  z.object({ scope: z.literal("dm"), officeId: z.uuid(), peerId: z.uuid() }),
]);

/** Histórico (últimas 50 mensagens do escopo, mais antigas primeiro). */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const sp = req.nextUrl.searchParams;
    const input = scopeSchema.parse({
      scope: sp.get("scope"),
      officeId: sp.get("officeId") ?? undefined,
      roomId: sp.get("roomId") ?? undefined,
      peerId: sp.get("peerId") ?? undefined,
    });
    await assertOfficeMember(supabase, input.officeId, user.id);

    let q = supabase.from("messages").select(SELECT).eq("office_id", input.officeId);
    if (input.scope === "office") q = q.is("room_id", null).is("recipient_id", null);
    if (input.scope === "room") {
      await assertRoomAccess(supabase, input.officeId, input.roomId);
      q = q.eq("room_id", input.roomId);
    }
    if (input.scope === "dm") {
      q = q.or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${input.peerId}),and(sender_id.eq.${input.peerId},recipient_id.eq.${user.id})`,
      );
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return NextResponse.json(
      { messages: (data ?? []).reverse() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

const postSchema = z.intersection(
  scopeSchema,
  z.object({ body: z.string().trim().min(1).max(2000) }),
);

/** Envia mensagem: valida, grava (RLS) e publica em tempo real via Ably. */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`msg:${user.id}`, 12, 10_000);
    if (!rl.ok) throw new HttpError(429, `Calma! Aguarde ${rl.retryAfter}s para enviar de novo.`);
    serverAbly(); // falha cedo se o Ably não estiver configurado

    const input = postSchema.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);

    const row: Record<string, unknown> = {
      office_id: input.officeId,
      sender_id: user.id,
      body: input.body,
    };
    if (input.scope === "room") {
      await assertRoomAccess(supabase, input.officeId, input.roomId);
      row.room_id = input.roomId;
    }
    if (input.scope === "dm") {
      if (input.peerId === user.id) throw new HttpError(400, "Não é possível enviar para você mesmo");
      row.recipient_id = input.peerId;
    }

    const { data, error } = await supabase.from("messages").insert(row).select(SELECT).single();
    if (error) {
      if (error.code === "42501") throw new HttpError(403, "Sem permissão para enviar aqui");
      throw error;
    }
    const msg = data as unknown as ChatMessage;

    if (input.scope === "office") await publishServer(ch.chat(input.officeId), "message", msg);
    if (input.scope === "room") await publishServer(ch.room(input.officeId, input.roomId), "message", msg);
    if (input.scope === "dm") {
      await Promise.all([
        publishServer(ch.dm(input.officeId, input.peerId), "message", msg),
        publishServer(ch.dm(input.officeId, user.id), "message", msg),
      ]);
    }
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
