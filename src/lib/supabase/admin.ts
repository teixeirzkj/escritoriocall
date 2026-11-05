import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MissingEnvError, publicSupabaseUrl, serverSupabaseSecret } from "@/lib/env";

/**
 * Cliente com a chave secreta (ignora RLS). Use SOMENTE no servidor e
 * SOMENTE depois de verificar a permissão do usuário no código.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = publicSupabaseUrl();
  if (!url) throw new MissingEnvError(["NEXT_PUBLIC_SUPABASE_URL"]);
  return createClient(url, serverSupabaseSecret(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
