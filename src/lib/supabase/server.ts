import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { MissingEnvError, publicSupabaseKey, publicSupabaseUrl } from "@/lib/env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Atua COM a sessão do usuário (RLS aplicada).
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  // cookies() primeiro: marca a rota como dinâmica (nunca pré-renderizada no build).
  const cookieStore = await cookies();
  const url = publicSupabaseUrl();
  const key = publicSupabaseKey();
  if (!url || !key) {
    throw new MissingEnvError(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}
