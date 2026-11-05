/**
 * Leitura centralizada de variáveis de ambiente.
 * As funções "server*" só devem ser chamadas no servidor.
 */

export function publicSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function publicSupabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(publicSupabaseUrl() && publicSupabaseKey());
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export class MissingEnvError extends Error {
  constructor(public readonly names: string[]) {
    super(`Variáveis de ambiente ausentes: ${names.join(", ")}`);
  }
}

function required(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = process.env[n];
    if (!v) missing.push(n);
    else out[n] = v;
  }
  if (missing.length) throw new MissingEnvError(missing);
  return out;
}

export function serverSupabaseSecret(): string {
  const v = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new MissingEnvError(["SUPABASE_SECRET_KEY"]);
  return v;
}

export function serverAbly(): { apiKey: string } {
  return { apiKey: required(["ABLY_API_KEY"]).ABLY_API_KEY };
}

export function serverLiveKit(): { apiKey: string; apiSecret: string; url: string; httpUrl: string } {
  const e = required(["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_URL"]);
  const url = e.LIVEKIT_URL;
  const httpUrl = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return { apiKey: e.LIVEKIT_API_KEY, apiSecret: e.LIVEKIT_API_SECRET, url, httpUrl };
}

/** Status de configuração (sem expor valores), usado na tela de admin. */
export function integrationStatus() {
  return {
    supabase: isSupabaseConfigured(),
    supabaseSecret: Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY),
    ably: Boolean(process.env.ABLY_API_KEY),
    livekit: Boolean(
      process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL,
    ),
  };
}
