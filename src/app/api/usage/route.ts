import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const body = z.object({ officeId: z.uuid(), kind: z.enum(["proximity", "meeting"]) });

/**
 * Registro de uso do LiveKit: o navegador avisa a cada minuto conectado.
 * Usado no painel "Uso e custos" da administração.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const input = body.parse(await req.json());
    // No máximo 1 minuto contado a cada 50s por pessoa e tipo.
    if (!rateLimit(`usage:${user.id}:${input.kind}`, 1, 50_000).ok) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    await assertOfficeMember(supabase, input.officeId, user.id);
    const { error } = await supabaseAdmin().rpc("bump_media_usage", {
      p_office: input.officeId,
      p_user: user.id,
      p_kind: input.kind,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
