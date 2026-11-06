import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { integrationStatus } from "@/lib/env";
import { presenceMembers } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import type { Office } from "@/lib/types";

export const metadata: Metadata = { title: "Administração" };

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}
export const dynamic = "force-dynamic";

export default async function Page() {
  const { supabase } = await requireAdmin();
  const status = integrationStatus();
  const since = hoursAgoIso(24);
  const [users, offices, rooms, msgs] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("offices").select("*").order("created_at"),
    supabase.from("rooms").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  const officeList = (offices.data ?? []) as Office[];
  const online = await Promise.all(
    officeList.map(async (o) => {
      if (!status.ably) return { office: o, count: null as number | null, names: [] as string[] };
      try {
        const members = await presenceMembers(ch.office(o.id));
        const uniq = new Map(members.map((m) => [m.clientId, (m.data as { name?: string })?.name ?? "Pessoa"]));
        return { office: o, count: uniq.size, names: Array.from(uniq.values()) };
      } catch {
        return { office: o, count: null, names: [] };
      }
    }),
  );

  const stats = [
    { label: "Usuários cadastrados", value: users.count ?? 0 },
    { label: "Escritórios", value: officeList.length },
    { label: "Salas de reunião", value: rooms.count ?? 0 },
    { label: "Mensagens (24h)", value: msgs.count ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-pixel text-3xl text-white">Visão geral</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Situação da plataforma agora.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-2xl font-semibold tabular-nums text-white">{s.value}</div>
            <div className="text-xs text-[var(--muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-white">Online agora</h2>
        {!status.ably && <p className="text-sm text-[var(--muted)]">Configure ABLY_API_KEY para ver a presença em tempo real.</p>}
        <ul className="divide-y divide-white/5">
          {online.map(({ office, count, names }) => (
            <li key={office.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/admin/escritorios/${office.id}`} className="font-medium text-white hover:underline">{office.name}</Link>
                {names.length > 0 && <p className="text-xs text-[var(--muted)]">{names.slice(0, 8).join(", ")}{names.length > 8 ? "…" : ""}</p>}
              </div>
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-[var(--text)]">
                {count === null ? "—" : `${count} online`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-white">Integrações</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            ["Supabase (autenticação e banco)", status.supabase],
            ["Supabase — chave secreta (gestão de usuários)", status.supabaseSecret],
            ["Ably (presença, movimento e chat)", status.ably],
            ["Cloudflare Realtime (áudio, vídeo e tela)", status.cloudflare],
            ["Cloudflare TURN (redes restritas, opcional)", status.cloudflareTurn],
            ["LiveKit (reserva, se o Cloudflare não estiver configurado)", status.livekit],
          ].map(([label, ok]) => (
            <li key={label as string} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm">
              {ok ? <CheckCircle2 size={16} className="text-emerald-400" /> : <CircleAlert size={16} className="text-[var(--amber)]" />}
              <span className="text-[var(--text)]">{label}</span>
              <span className={`ml-auto text-xs ${ok ? "text-emerald-300" : "text-[var(--amber)]"}`}>{ok ? "configurado" : "pendente"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
