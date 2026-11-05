import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, getProfile, HttpError } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch, type RingMsg } from "@/lib/realtime/channels";
import { onlineMembers } from "@/lib/server-presence";

export const dynamic = "force-dynamic";

const body = z.object({
  officeId: z.uuid(),
  toUserId: z.uuid(),
  where: z.string().trim().max(80),
  roomId: z.uuid().nullable(),
});

/** "Chamar" alguém: toca um aviso para a pessoa com o lugar de quem chamou. */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const input = body.parse(await req.json());
    if (input.toUserId === user.id) throw new HttpError(400, "Você não pode chamar a si mesmo.");
    const rl = rateLimit(`ring:${user.id}:${input.toUserId}`, 1, 15_000);
    if (!rl.ok) throw new HttpError(429, `Você acabou de chamar. Aguarde ${rl.retryAfter}s.`);
    await assertOfficeMember(supabase, input.officeId, user.id);
    const online = await onlineMembers(input.officeId);
    const target = online.get(input.toUserId);
    if (!target) throw new HttpError(404, "Essa pessoa não está online agora.");
    // A sala só vai junto se quem chama estiver mesmo nela.
    const roomId = input.roomId && online.get(user.id)?.roomId === input.roomId ? input.roomId : null;
    const me = await getProfile(supabase, user.id);
    const msg: RingMsg = { fromId: user.id, fromName: me?.display_name ?? "Alguém", where: input.where, roomId };
    await publishServer(ch.dm(input.officeId, input.toUserId), "ring", msg);
    return NextResponse.json({ ok: true, status: target.status ?? "disponivel" });
  } catch (e) {
    return handleRouteError(e);
  }
}
