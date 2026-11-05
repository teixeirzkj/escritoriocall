import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { RoomServiceClient } from "livekit-server-sdk";
import { requireAdmin } from "@/lib/auth";
import { serverLiveKit } from "@/lib/env";
import { ablyRest } from "@/lib/realtime/ably-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Uso e custos" };

const fmt = new Intl.NumberFormat("pt-BR");
const hours = (min: number) => (min >= 60 ? `${fmt.format(Math.round((min / 60) * 10) / 10)} h` : `${min} min`);

/** Primeiro dia do mês atual (horário de Brasília), "AAAA-MM-01". */
function monthStart(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function ablyMonth() {
  try {
    const page = await ablyRest().stats({ unit: "month", limit: 1, direction: "backwards" });
    const e = page.items[0]?.entries ?? {};
    return {
      ok: true as const,
      messages: e["messages.all.all.count"] ?? 0,
      peakConnections: e["connections.all.peak"] ?? 0,
      peakChannels: e["channels.peak"] ?? 0,
    };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveKitNow() {
  try {
    const cfg = serverLiveKit();
    const svc = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
    const rooms = await svc.listRooms();
    return { ok: true as const, rooms: rooms.length, participants: rooms.reduce((n, r) => n + (r.numParticipants ?? 0), 0) };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function UsagePage() {
  await requireAdmin();
  const since = monthStart();
  const admin = supabaseAdmin();
  const [{ data: rows }, ably, live] = await Promise.all([
    admin.from("media_usage").select("day, user_id, kind, minutes").gte("day", since),
    ablyMonth(),
    liveKitNow(),
  ]);

  const usage = (rows ?? []) as { day: string; user_id: string; kind: "proximity" | "meeting"; minutes: number }[];
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
          Mês atual (desde {since.split("-").reverse().join("/")}). Compare com o limite do seu plano nos painéis do LiveKit e do Ably.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card title="LiveKit · minutos de participante" value={hours(total)} hint={`${fmt.format(total)} min no mês`} />
        <Card title="Proximidade (andando pelo mapa)" value={hours(prox)} hint="conta o tempo todo em que a pessoa está online" />
        <Card title="Reuniões (salas)" value={hours(meet)} hint="tempo dentro das salas de reunião" />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {ably.ok ? (
          <>
            <Card title="Ably · mensagens no mês" value={fmt.format(ably.messages)} hint="movimento, presença, chat e avisos" />
            <Card title="Ably · pico de conexões" value={fmt.format(ably.peakConnections)} hint="pessoas conectadas ao mesmo tempo" />
            <Card title="Ably · pico de canais" value={fmt.format(ably.peakChannels)} hint="canais abertos ao mesmo tempo" />
          </>
        ) : (
          <div className="card p-4 text-sm text-[#ff9b92] sm:col-span-3">Não foi possível ler o uso do Ably: {ably.error}</div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-semibold text-white">Agora</h2>
        {live.ok ? (
          <p className="text-sm text-[var(--muted)]">
            {live.participants} {live.participants === 1 ? "pessoa conectada" : "pessoas conectadas"} ao áudio/vídeo em {live.rooms}{" "}
            {live.rooms === 1 ? "sala" : "salas"} do LiveKit.
          </p>
        ) : (
          <p className="text-sm text-[#ff9b92]">Não foi possível consultar o LiveKit: {live.error}</p>
        )}
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

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{title}</div>
      <div className="mt-1 font-pixel text-2xl text-white">{value}</div>
      <div className="mt-1 text-[11px] text-[var(--muted)]">{hint}</div>
    </div>
  );
}
