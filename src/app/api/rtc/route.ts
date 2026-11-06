import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { cf, iceServers, issueRtcTicket, verifyRtcTicket, type RtcClaims } from "@/lib/cf-realtime";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRoomTicket } from "@/lib/room-ticket";
import { onlineMembers } from "@/lib/server-presence";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const sdp = z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().min(10).max(200_000) });
const ticket = z.string().min(20).max(600);
const trackName = z.string().regex(/^[a-z]{2,8}-\d{1,6}$/);
const rid = z.enum(["a", "b"]);

const body = z.discriminatedUnion("op", [
  // Nova sessão de mídia: proximidade (roomId ausente) ou sala de reunião.
  z.object({ op: z.literal("session"), officeId: z.uuid(), roomId: z.uuid().optional(), knock: z.string().max(200).optional() }),
  // Publica faixas locais (microfone, câmera, tela).
  z.object({
    op: z.literal("push"),
    tk: ticket,
    offer: sdp,
    tracks: z.array(z.object({ mid: z.string().max(10), trackName })).min(1).max(8),
  }),
  // Recebe faixas de outras pessoas (validado: mesma sede e mesma sala).
  z.object({
    op: z.literal("pull"),
    tk: ticket,
    tracks: z.array(z.object({ tk: ticket, trackName, rid: rid.optional() })).min(1).max(32),
  }),
  z.object({ op: z.literal("renegotiate"), tk: ticket, answer: sdp }),
  z.object({ op: z.literal("close"), tk: ticket, mids: z.array(z.string().max(10)).min(1).max(32), offer: sdp.optional() }),
  // Troca a qualidade (camada do simulcast) de vídeos recebidos.
  z.object({
    op: z.literal("quality"),
    tk: ticket,
    tracks: z.array(z.object({ tk: ticket, trackName, mid: z.string().max(10), rid })).min(1).max(32),
  }),
]);

/** Passe da própria sessão: precisa ser desta pessoa e válido. */
function own(tk: string, userId: string): RtcClaims {
  const c = verifyRtcTicket(tk);
  if (!c || c.u !== userId) throw new HttpError(401, "Sessão de mídia expirada. Reconectando…");
  return c;
}

/** Só recebe de quem está na mesma sede e no mesmo espaço (proximidade ou a mesma sala). */
function peer(tk: string, mine: RtcClaims): RtcClaims | null {
  const c = verifyRtcTicket(tk);
  return c && c.o === mine.o && c.r === mine.r ? c : null;
}

/**
 * Áudio e vídeo pelo Cloudflare Realtime. O App Secret fica só aqui: o navegador fala
 * com esta rota, que confere quem pode publicar e quem pode receber de quem.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    if (!rateLimit(`rtc:${user.id}`, 120, 60_000).ok) throw new HttpError(429, "Muitas solicitações de mídia. Aguarde um instante.");
    const input = body.parse(await req.json());

    switch (input.op) {
      case "session": {
        const { office } = await assertOfficeMember(supabase, input.officeId, user.id);
        let roomId: string | null = null;
        if (input.roomId) {
          const room = await assertRoomAccess(supabase, office.id, input.roomId);
          roomId = room.id;
          const online = await onlineMembers(office.id);
          const inside = Array.from(online.entries()).filter(([id, d]) => d.roomId === room.id && id !== user.id);
          const wasInside = online.get(user.id)?.roomId === room.id;
          // Sala trancada: entra quem trancou, quem já estava nela ou quem tem o passe da porta.
          // Se quem trancou já saiu, a sala destranca.
          const lockedBy = (room as unknown as { locked_by?: string | null }).locked_by ?? null;
          if (lockedBy && lockedBy !== user.id && !wasInside) {
            const lockerInside = online.get(lockedBy)?.roomId === room.id;
            if (!lockerInside) {
              await supabaseAdmin().from("rooms").update({ locked_by: null }).eq("id", room.id);
            } else if (!verifyRoomTicket(input.knock, room.id, user.id)) {
              throw new HttpError(423, `A sala "${room.name}" está trancada. Bata na porta para pedir para entrar.`);
            }
          }
          if (!wasInside && inside.length >= room.capacity) {
            throw new HttpError(409, `A sala "${room.name}" está cheia (${room.capacity} pessoas).`);
          }
        }
        const [{ sessionId }, ice] = await Promise.all([cf.newSession(), iceServers()]);
        const tk = issueRtcTicket({ s: sessionId, o: office.id, r: roomId, u: user.id });
        return NextResponse.json({ sessionId, tk, iceServers: ice }, { headers: { "Cache-Control": "no-store" } });
      }
      case "push": {
        const me = own(input.tk, user.id);
        return NextResponse.json(await cf.pushTracks(me.s, input.offer, input.tracks));
      }
      case "pull": {
        const me = own(input.tk, user.id);
        // Quem foi removido da sede não recebe mais nada.
        await assertOfficeMember(supabase, me.o, user.id);
        // Passes inválidos (outra sala, expirado) voltam como recusados, sem derrubar os outros.
        const rejected: { session: string | null; trackName: string }[] = [];
        const tracks: { sessionId: string; trackName: string; simulcast?: { preferredRid: string } }[] = [];
        for (const t of input.tracks) {
          const p = peer(t.tk, me);
          if (!p) rejected.push({ session: verifyRtcTicket(t.tk)?.s ?? null, trackName: t.trackName });
          else tracks.push({ sessionId: p.s, trackName: t.trackName, simulcast: t.rid ? { preferredRid: t.rid } : undefined });
        }
        if (!tracks.length) return NextResponse.json({ tracks: [], rejected });
        return NextResponse.json({ ...(await cf.pullTracks(me.s, tracks)), rejected });
      }
      case "renegotiate": {
        const me = own(input.tk, user.id);
        return NextResponse.json(await cf.renegotiate(me.s, input.answer));
      }
      case "close": {
        const me = own(input.tk, user.id);
        return NextResponse.json(await cf.closeTracks(me.s, input.mids, input.offer ?? null));
      }
      case "quality": {
        const me = own(input.tk, user.id);
        const tracks = input.tracks.flatMap((t) => {
          const p = peer(t.tk, me);
          return p ? [{ sessionId: p.s, trackName: t.trackName, mid: t.mid, preferredRid: t.rid }] : [];
        });
        if (!tracks.length) return NextResponse.json({ tracks: [] });
        return NextResponse.json(await cf.updateTracks(me.s, tracks));
      }
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
