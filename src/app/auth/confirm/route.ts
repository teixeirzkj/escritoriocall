import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Verificação por token_hash — usada quando os modelos de e-mail do Supabase
 * apontam para {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...
 * (funciona mesmo se o link for aberto em outro navegador).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const defaultNext = type === "recovery" ? "/nova-senha" : "/personagem";
  const next = safeNext(url.searchParams.get("next"), defaultNext);
  if (tokenHash && type) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
}
