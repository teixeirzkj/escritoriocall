import { NextResponse, type NextRequest } from "next/server";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { assertUser, getProfile, HttpError } from "@/lib/auth";
import { serverLiveKit } from "@/lib/env";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { lk } from "@/lib/realtime/channels";
import { verifyRoomTicket } from "@/lib/room-ticket";
import { onlineMembers } from "@/lib/server-presence";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("proximity"), officeId: z.uuid() }),
  z.object({ kind: z.literal("room"), officeId: z.uuid(), roomId: z.uuid(), ticket: z.string().max(200).optional() }),
]);

/**
 * Gera um token temporário do LiveKit.
 *  - "proximity": sala de áudio/vídeo por proximidade do escritório.
 *  - "room": sala de reunião; valida acesso (privada) e capacidade.
 * A identidade é o id do usuário: uma nova conexão com a mesma identidade
 * derruba a anterior (controle de conexão duplicada no lado do LiveKit).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`lk:${user.id}`, 30, 60_000);
    if (!rl.ok) throw new HttpError(429, "Muitas solicitações de token");

    const input = body.parse(await req.json());
    const { office } = await assertOfficeMember(supabase, input.officeId, user.id);
    const profile = await getProfile(supabase, user.id);
    const cfg = serverLiveKit();

    let roomName: string;
    if (input.kind === "room") {
      const room = await assertRoomAccess(supabase, office.id, input.roomId);
      roomName = lk.room(office.id, room.id);
      // Capacidade: conta participantes reais conectados à sala no LiveKit.
      const svc = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
      let participants: { identity: string }[] = [];
      try {
        participants = await svc.listParticipants(roomName);
      } catch {
        participants = []; // sala ainda não existe no LiveKit
      }
      const already = participants.some((p) => p.identity === user.id);

      // Sala trancada: entra quem já estava nela, quem trancou ou quem tem o passe
      // (alguém de dentro abriu a porta). Se quem trancou já saiu, a sala destranca.
      const lockedBy = (room as unknown as { locked_by?: string | null }).locked_by ?? null;
      if (lockedBy && lockedBy !== user.id && !already) {
        const online = await onlineMembers(office.id);
        const lockerInside = online.get(lockedBy)?.roomId === room.id;
        const wasInside = online.get(user.id)?.roomId === room.id;
        if (!lockerInside) {
          await supabaseAdmin().from("rooms").update({ locked_by: null }).eq("id", room.id);
        } else if (!wasInside && !verifyRoomTicket(input.ticket, room.id, user.id)) {
          throw new HttpError(423, `A sala "${room.name}" está trancada. Bata na porta para pedir para entrar.`);
        }
      }
      if (!already && participants.length >= room.capacity) {
        throw new HttpError(409, `A sala "${room.name}" está cheia (${room.capacity} pessoas).`);
      }
    } else {
      roomName = lk.proximity(office.id);
    }

    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: user.id,
      name: profile?.display_name ?? "Pessoa",
      ttl: "15m",
      metadata: JSON.stringify({ avatar: profile?.avatar_config ?? null }),
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });

    return NextResponse.json(
      { token: await at.toJwt(), url: cfg.url, room: roomName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
