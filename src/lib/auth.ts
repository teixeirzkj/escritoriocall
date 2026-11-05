import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Usuário autenticado validado (JWT verificado), ou null. */
export async function getSessionUser(
  supabase?: SupabaseClient,
): Promise<{ user: SessionUser | null; supabase: SupabaseClient }> {
  await connection(); // sempre dinâmico: depende da sessão da requisição
  if (!supabase && !isSupabaseConfigured()) redirect("/configuracao");
  const sb = supabase ?? (await supabaseServer());
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims?.sub) return { user: null, supabase: sb };
  return {
    user: { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null },
    supabase: sb,
  };
}

export async function getProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Para páginas: exige login (redireciona) e devolve usuário + perfil. */
export async function requireUser(nextPath?: string) {
  const { user, supabase } = await getSessionUser();
  if (!user) redirect(`/entrar${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/entrar?erro=perfil");
  return { user, profile, supabase };
}

/** Para páginas: exige administrador global. */
export async function requireAdmin() {
  const ctx = await requireUser("/admin");
  if (ctx.profile.role !== "admin") redirect("/escritorio?erro=sem-permissao");
  return ctx;
}

/** Verifica se o usuário é admin global ou moderador/dono do escritório. */
export async function isOfficeManager(sb: SupabaseClient, officeId: string): Promise<boolean> {
  const { data } = await sb.rpc("is_office_manager", { oid: officeId });
  return data === true;
}

/** Para Server Actions / Route Handlers: lança em vez de redirecionar. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function assertUser() {
  if (!isSupabaseConfigured()) throw new HttpError(503, "Supabase não configurado no servidor");
  const { user, supabase } = await getSessionUser();
  if (!user) throw new HttpError(401, "Não autenticado");
  return { user, supabase };
}

export async function assertAdmin() {
  const ctx = await assertUser();
  const profile = await getProfile(ctx.supabase, ctx.user.id);
  if (profile?.role !== "admin") throw new HttpError(403, "Acesso restrito a administradores");
  return { ...ctx, profile };
}

export async function assertOfficeManager(officeId: string) {
  const ctx = await assertUser();
  if (!(await isOfficeManager(ctx.supabase, officeId))) {
    throw new HttpError(403, "Você não gerencia este escritório");
  }
  return ctx;
}
