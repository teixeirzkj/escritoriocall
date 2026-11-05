import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, getProfile, HttpError } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch, type KnockAnswerMsg, type KnockMsg } from "@/lib/realtime/channels";
import { issueRoomTicket } from "@/lib/room-ticket";
import { isInRoom } from "@/lib/server-presence";

export const dynamic = "force-dynamic";

const body = z.intersection(
  z.object({ officeId: z.uuid(), roomId: z.uuid() }),
  z.discriminatedUnion("action", [
    z.object({ action: z.literal("knock") }),
    z.object({ action: z.literal("answer"), toUserId: z.uuid(), accept: z.boolean() }),
  ]),
);

/**
 * "Bater na porta" de uma sala trancada e responder à batida.
 * Quem está dentro aceita: o servidor entrega um passe de 2 minutos para quem bateu.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const input = body.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    const room = await assertRoomAccess(supabase, input.officeId, input.roomId);
    const me = await getProfile(supabase, user.id);
    const myName = me?.display_name ?? "Alguém";

    if (input.action === "knock") {
      const rl = rateLimit(`knock:${user.id}:${room.id}`, 3, 30_000);
      if (!rl.ok) throw new HttpError(429, `Aguarde ${rl.retryAfter}s para bater de novo.`);
      const msg: KnockMsg = { fromId: user.id, fromName: myName, roomId: room.id };
      await publishServer(ch.room(input.officeId, room.id), "knock", msg);
      return NextResponse.json({ ok: true });
    }

    const rl = rateLimit(`knock-answer:${user.id}`, 20, 30_000);
    if (!rl.ok) throw new HttpError(429, "Calma!");
    if (!(await isInRoom(input.officeId, user.id, room.id))) {
      throw new HttpError(403, "Só quem está na reunião pode abrir a porta.");
    }
    const answer: KnockAnswerMsg = {
      roomId: room.id,
      accepted: input.accept,
      ticket: input.accept ? issueRoomTicket(room.id, input.toUserId) : null,
      byName: myName,
    };
    await publishServer(ch.dm(input.officeId, input.toUserId), "knock-answer", answer);
    await publishServer(ch.room(input.officeId, room.id), "knock-resolved", { fromId: input.toUserId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
