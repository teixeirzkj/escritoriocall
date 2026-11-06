import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { mediaProvider, serverLiveKit } from "@/lib/env";
import { ablyRest } from "@/lib/realtime/ably-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Limites mensais dos planos contratados (padrão: planos gratuitos). */
export const planLimitsSchema = z.object({
  livekit_minutes: z.coerce.number().int().min(1),
  livekit_concurrent: z.coerce.number().int().min(1),
  ably_messages: z.coerce.number().int().min(1),
  ably_connections: z.coerce.number().int().min(1),
  ably_channels: z.coerce.number().int().min(1),
  /** Cloudflare Realtime: GB recebidos por mês (1.000 grátis). */
  cf_gb: z.coerce.number().int().min(1).default(1000),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;
export const FREE_LIMITS: PlanLimits = {
  livekit_minutes: 5000,
  livekit_concurrent: 100,
  ably_messages: 6_000_000,
  ably_connections: 200,
  ably_channels: 200,
  cf_gb: 1000,
};

export type Level = "ok" | "warn" | "danger";
export interface Meter {
  key: keyof PlanLimits;
  label: string;
  hint: string;
  used: number;
  limit: number;
  pct: number;
  level: Level;
}

/** 70% = atenção, 90% = crítico. */
export const levelOf = (pct: number): Level => (pct >= 90 ? "danger" : pct >= 70 ? "warn" : "ok");

/** Primeiro dia do mês atual (horário de Brasília), "AAAA-MM-01". */
export function monthStart(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function getPlanLimits(): Promise<PlanLimits> {
  const { data } = await supabaseAdmin().from("platform_settings").select("value").eq("key", "plan_limits").maybeSingle();
  const r = planLimitsSchema.safeParse(data?.value);
  return r.success ? r.data : FREE_LIMITS;
}

async function ablyMonth() {
  try {
    const page = await ablyRest().stats({ unit: "month", limit: 1, direction: "backwards" });
    const e = page.items[0]?.entries ?? {};
    return {
      messages: (e["messages.all.all.count"] as number | undefined) ?? 0,
      connections: (e["connections.all.peak"] as number | undefined) ?? 0,
      channels: (e["channels.peak"] as number | undefined) ?? 0,
    };
  } catch {
    return null;
  }
}

async function liveKitNow() {
  try {
    const cfg = serverLiveKit();
    const svc = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
    const rooms = await svc.listRooms();
    return rooms.reduce((n, r) => n + (r.numParticipants ?? 0), 0);
  } catch {
    return null;
  }
}

async function monthMedia(): Promise<{ minutes: number; bytes: number }> {
  const { data } = await supabaseAdmin().from("media_usage").select("minutes, bytes").gte("day", monthStart());
  return (data ?? []).reduce(
    (acc, r) => ({ minutes: acc.minutes + ((r.minutes as number) ?? 0), bytes: acc.bytes + Number(r.bytes ?? 0) }),
    { minutes: 0, bytes: 0 },
  );
}

export const GB = 1024 ** 3;

function meter(key: keyof PlanLimits, label: string, hint: string, used: number, limit: number): Meter {
  const pct = Math.round((used / Math.max(1, limit)) * 1000) / 10;
  return { key, label, hint, used, limit, pct, level: levelOf(pct) };
}

/** Uso do mês x limites do plano. */
export async function usageMeters(): Promise<{
  meters: Meter[];
  limits: PlanLimits;
  ablyOk: boolean;
  liveOk: boolean;
  provider: "cloudflare" | "livekit";
}> {
  const provider = mediaProvider();
  const [limits, media, ably, live] = await Promise.all([
    getPlanLimits(),
    monthMedia(),
    ablyMonth(),
    provider === "livekit" ? liveKitNow() : Promise.resolve(null),
  ]);
  const meters: Meter[] = [];
  if (provider === "cloudflare") {
    // Em GB com uma casa decimal (o medidor guarda números inteiros de décimos).
    const gb = Math.round((media.bytes / GB) * 10) / 10;
    meters.push(meter("cf_gb", "Cloudflare · GB recebidos no mês", "voz, vídeo e tela que as pessoas receberam (todas as sedes)", gb, limits.cf_gb));
  } else {
    meters.push(meter("livekit_minutes", "LiveKit · minutos no mês", "voz e vídeo (proximidade + reuniões), todas as sedes", media.minutes, limits.livekit_minutes));
    if (live !== null) meters.push(meter("livekit_concurrent", "LiveKit · conectados agora", "pessoas no áudio/vídeo neste momento", live, limits.livekit_concurrent));
  }
  if (ably) {
    meters.push(
      meter("ably_messages", "Ably · mensagens no mês", "movimento, presença, chat e avisos", ably.messages, limits.ably_messages),
      meter("ably_connections", "Ably · pico de conexões", "pessoas conectadas ao mesmo tempo (no mês)", ably.connections, limits.ably_connections),
      meter("ably_channels", "Ably · pico de canais", "canais abertos ao mesmo tempo (no mês)", ably.channels, limits.ably_channels),
    );
  }
  return { meters, limits, ablyOk: ably !== null, liveOk: provider === "cloudflare" || live !== null, provider };
}

let cache: { at: number; meters: Meter[] } | null = null;
/** Medidores que passaram de 70% (cache de 5 min, para o aviso nas páginas do admin). */
export async function usageAlerts(): Promise<Meter[]> {
  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    try {
      cache = { at: Date.now(), meters: (await usageMeters()).meters };
    } catch {
      return [];
    }
  }
  return cache.meters.filter((m) => m.level !== "ok");
}
export function clearUsageCache() {
  cache = null;
}
