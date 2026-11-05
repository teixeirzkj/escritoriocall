import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import { isInRoom } from "@/lib/server-presence";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const body = z.object({ officeId: z.uuid(), roomId: z.uuid(), locked: z.boolean() });

/** Tranca / destranca a sala. Só quem está dentro da reunião pode. */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`lock:${user.id}`, 10, 30_000);
    if (!rl.ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const input = body.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    await assertRoomAccess(supabase, input.officeId, input.roomId);
    if (!(await isInRoom(input.officeId, user.id, input.roomId))) {
      throw new HttpError(403, "Só quem está na reunião pode trancar ou destrancar a sala.");
    }
    const { error } = await supabaseAdmin()
      .from("rooms")
      .update({ locked_by: input.locked ? user.id : null })
      .eq("id", input.roomId);
    if (error) throw error;
    await publishServer(ch.control(input.officeId), "control", { type: "rooms-updated" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
