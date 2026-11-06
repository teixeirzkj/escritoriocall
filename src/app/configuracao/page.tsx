import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { integrationStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Configuração pendente" };

/**
 * Exibida quando o Supabase ainda não foi configurado. Mostra apenas se
 * cada integração está presente (nunca os valores).
 */
export default async function Page() {
  await connection();
  const s = integrationStatus();
  const items: [string, boolean, string][] = [
    ["Supabase (obrigatório)", s.supabase, "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    ["Supabase — chave secreta", s.supabaseSecret, "SUPABASE_SECRET_KEY (gestão de usuários)"],
    ["Ably (tempo real)", s.ably, "ABLY_API_KEY"],
    ["Cloudflare Realtime (áudio e vídeo)", s.cloudflare, "CF_REALTIME_APP_ID e CF_REALTIME_APP_SECRET (TURN opcional: CF_TURN_KEY_ID e CF_TURN_KEY_TOKEN)"],
    ["LiveKit (reserva de áudio e vídeo)", s.livekit, "LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET"],
  ];
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="font-pixel text-2xl text-white">Quase lá</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            A plataforma ainda não está conectada aos serviços externos. Defina as variáveis de ambiente abaixo
            (veja <code>.env.example</code> e o README) e reinicie o servidor ou faça um novo deploy.
          </p>
          <ul className="mt-6 space-y-2">
            {items.map(([label, ok, vars]) => (
              <li key={label} className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-3">
                {ok ? <CheckCircle2 size={18} className="mt-0.5 text-emerald-400" /> : <CircleAlert size={18} className="mt-0.5 text-[var(--amber)]" />}
                <div>
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-[var(--muted)]">{vars}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
