import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { ablyRest } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";

export const dynamic = "force-dynamic";

const query = z.object({
  officeId: z.uuid(),
  roomId: z.uuid().optional(),
});

/**
 * Emite um TokenRequest do Ably com capacidades mínimas:
 *  - canal do escritório: presença, publicar e assinar (movimento);
 *  - chat geral, controle e a própria caixa de DMs: somente assinar;
 *  - chat da sala: somente assinar e apenas se o usuário tiver acesso.
 * O clientId é sempre o id do usuário autenticado (não pode ser forjado).
 */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`ably:${user.id}`, 30, 60_000);
    if (!rl.ok) throw new HttpError(429, "Muitas solicitações de token");

    const params = query.parse({
      officeId: req.nextUrl.searchParams.get("officeId") ?? undefined,
      roomId: req.nextUrl.searchParams.get("roomId") || undefined,
    });
    await assertOfficeMember(supabase, params.officeId, user.id);

    const capability: Record<string, ("publish" | "subscribe" | "presence" | "history")[]> = {
      [ch.office(params.officeId)]: ["publish", "subscribe", "presence"],
      [ch.chat(params.officeId)]: ["subscribe"],
      [ch.control(params.officeId)]: ["subscribe"],
      [ch.dm(params.officeId, user.id)]: ["subscribe"],
    };

    if (params.roomId) {
      const { data: ok } = await supabase.rpc("can_access_room", { rid: params.roomId });
      const { data: room } = await supabase
        .from("rooms")
        .select("office_id")
        .eq("id", params.roomId)
        .maybeSingle();
      if (ok === true && room?.office_id === params.officeId) {
        capability[ch.room(params.officeId, params.roomId)] = ["subscribe"];
      }
    }

    const tokenRequest = await ablyRest().auth.createTokenRequest({
      clientId: user.id,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000,
    });
    return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}
