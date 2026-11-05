import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { DESK_SEATS } from "@/lib/game/map";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const body = z.object({
  officeId: z.uuid(),
  desk: z.number().int().min(0).max(DESK_SEATS.length - 1).nullable(),
});

/** Define (ou libera) a mesa fixa da pessoa no escritório. */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`desk:${user.id}`, 6, 30_000);
    if (!rl.ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const input = body.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    const { error } = await supabaseAdmin()
      .from("office_members")
      .update({ desk: input.desk })
      .eq("office_id", input.officeId)
      .eq("user_id", user.id);
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "Essa mesa já é de outra pessoa.");
      throw error;
    }
    await publishServer(ch.control(input.officeId), "control", { type: "office-updated" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
