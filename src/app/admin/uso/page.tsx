import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { savePlanLimits } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { Labeled } from "@/components/admin/OfficeFields";
import { type Meter, monthStart, usageMeters } from "@/lib/plan";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Uso e custos" };

const fmt = new Intl.NumberFormat("pt-BR");
const hours = (min: number) => (min >= 60 ? `${fmt.format(Math.round((min / 60) * 10) / 10)} h` : `${min} min`);

export default async function UsagePage() {
  await requireAdmin();
  const since = monthStart();
  const admin = supabaseAdmin();
  const [{ data: rows }, { meters, limits, ablyOk, liveOk }, { data: officeRows }] = await Promise.all([
    admin.from("media_usage").select("day, office_id, user_id, kind, minutes").gte("day", since),
    usageMeters(),
    admin.from("offices").select("id, name"),
  ]);

  const usage = (rows ?? []) as { day: string; office_id: string; user_id: string; kind: "proximity" | "meeting"; minutes: number }[];
  const officeName = new Map((officeRows ?? []).map((o) => [o.id as string, o.name as string]));
  const byOffice = new Map<string, number>();
  for (const r of usage) byOffice.set(r.office_id, (byOffice.get(r.office_id) ?? 0) + r.minutes);
  const offices = Array.from(byOffice, ([id, m]) => ({ id, name: officeName.get(id) ?? "Sede excluída", m })).sort((x, y) => y.m - x.m);
  // Projeção: ritmo do mês até hoje estendido ao mês inteiro.
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projected = Math.round((usage.reduce((n, r) => n + r.minutes, 0) / today.getDate()) * daysInMonth);
  const total = usage.reduce((n, r) => n + r.minutes, 0);
  const prox = usage.filter((r) => r.kind === "proximity").reduce((n, r) => n + r.minutes, 0);
  const meet = total - prox;

  const byUser = new Map<string, { prox: number; meet: number }>();
  for (const r of usage) {
    const u = byUser.get(r.user_id) ?? { prox: 0, meet: 0 };
    if (r.kind === "proximity") u.prox += r.minutes;
    else u.meet += r.minutes;
    byUser.set(r.user_id, u);
  }
  const ids = Array.from(byUser.keys());
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const people = ids
    .map((id) => ({ id, name: nameOf.get(id) ?? "—", ...byUser.get(id)! }))
    .sort((a, b) => b.prox + b.meet - (a.prox + a.meet));

  const byDay = new Map<string, number>();
  for (const r of usage) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.minutes);
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const maxDay = Math.max(1, ...days.map(([, m]) => m));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-pixel text-2xl text-white">Uso e custos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Mês atual (desde {since.split("-").reverse().join("/")}), somando todas as sedes.
        </p>
      </div>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold text-white">Uso do plano</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Aviso no painel ao passar de 70% (amarelo) e de 90% (vermelho). No plano gratuito do LiveKit, ao chegar em 100% a voz e
          o vídeo param de conectar até virar o mês.
        </p>
        <div className="space-y-4">
          {meters.map((m) => (
            <MeterBar key={m.key} m={m} />
          ))}
        </div>
        {!liveOk && <p className="mt-3 text-xs text-[#ff9b92]">Não foi possível consultar o LiveKit agora.</p>}
        {!ablyOk && <p className="mt-1 text-xs text-[#ff9b92]">Não foi possível ler o uso do Ably.</p>}
        <p className="mt-4 text-xs text-[var(--muted)]">
          No ritmo atual, o mês fecha com cerca de <strong className="text-white">{fmt.format(projected)} min</strong> de LiveKit
          {" "}({fmt.format(Math.round((projected / limits.livekit_minutes) * 100))}% do limite). Proximidade: {hours(prox)} · reuniões: {hours(meet)}.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold text-white">Minutos de LiveKit por sede</h2>
        {offices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Ainda sem registros neste mês.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {offices.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-white">{o.name}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {hours(o.m)} · {fmt.format(Math.round((o.m / Math.max(1, total)) * 100))}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold text-white">Limites do plano contratado</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Já preenchidos com os planos gratuitos. Ao mudar de plano no LiveKit ou no Ably, atualize aqui para os avisos ficarem certos.
        </p>
        <ActionForm action={savePlanLimits} submitLabel="Salvar limites" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Labeled label="LiveKit · minutos por mês">
              <input name="livekit_minutes" type="number" min={1} required defaultValue={limits.livekit_minutes} className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="LiveKit · conectados ao mesmo tempo">
              <input name="livekit_concurrent" type="number" min={1} required defaultValue={limits.livekit_concurrent} className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Ably · mensagens por mês">
              <input name="ably_messages" type="number" min={1} required defaultValue={limits.ably_messages} className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Ably · conexões simultâneas">
              <input name="ably_connections" type="number" min={1} required defaultValue={limits.ably_connections} className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Ably · canais simultâneos">
              <input name="ably_channels" type="number" min={1} required defaultValue={limits.ably_channels} className="input h-10 text-sm" />
            </Labeled>
          </div>
        </ActionForm>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold text-white">Por dia</h2>
        {days.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Ainda sem registros neste mês.</p>
        ) : (
          <ul className="space-y-1.5">
            {days.map(([day, m]) => (
              <li key={day} className="flex items-center gap-3 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{day.slice(8, 10)}/{day.slice(5, 7)}</span>
                <span className="h-3 rounded bg-[var(--amber)]" style={{ width: `${Math.max(2, (m / maxDay) * 100)}%` }} />
                <span className="shrink-0 tabular-nums text-white">{hours(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold text-white">Por pessoa</h2>
        {people.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">Ainda sem registros neste mês.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Pessoa</th>
                <th className="px-4 py-2 text-right font-medium">Proximidade</th>
                <th className="px-4 py-2 text-right font-medium">Reuniões</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-white">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--muted)]">{hours(p.prox)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--muted)]">{hours(p.meet)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-white">{hours(p.prox + p.meet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-wrap gap-2 text-sm">
        <a href="https://cloud.livekit.io" target="_blank" rel="noreferrer noopener" className="btn-ghost h-9 px-3">
          Painel do LiveKit <ExternalLink size={14} />
        </a>
        <a href="https://ably.com/accounts" target="_blank" rel="noreferrer noopener" className="btn-ghost h-9 px-3">
          Painel do Ably <ExternalLink size={14} />
        </a>
      </section>
      <p className="text-xs text-[var(--muted)]">
        Os minutos do LiveKit são medidos pelo próprio site (um registro por minuto conectado) e podem diferir um pouco da
        fatura. A contagem começou na data em que este painel foi publicado.
      </p>
    </div>
  );
}

function MeterBar({ m }: { m: Meter }) {
  const color = m.level === "danger" ? "bg-[var(--coral)]" : m.level === "warn" ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-white">{m.label}</span>
        <span className="tabular-nums text-[var(--muted)]">
          {fmt.format(m.used)} de {fmt.format(m.limit)} · <strong className="text-white">{fmt.format(m.pct)}%</strong>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={m.pct} aria-valuemin={0} aria-valuemax={100} aria-label={m.label}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-[var(--muted)]">{m.hint}</div>
    </div>
  );
}
