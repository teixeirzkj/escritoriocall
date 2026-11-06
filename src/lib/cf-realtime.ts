import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/auth";
import { serverCloudflareRealtime, serverSigningSecret } from "@/lib/env";

/**
 * Cloudflare Realtime (SFU): chamadas à API com o App Secret (só no servidor) e
 * os passes de sessão que ligam cada sessão de mídia a uma pessoa, sede e sala.
 */

const API = "https://rtc.live.cloudflare.com/v1";

export interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface CfTrackResult {
  location?: "local" | "remote";
  mid?: string;
  trackName?: string;
  sessionId?: string;
  errorCode?: string;
  errorDescription?: string;
}

export interface CfTracksResponse {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: SessionDescription;
  tracks?: CfTrackResult[];
  errorCode?: string;
  errorDescription?: string;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const cfg = serverCloudflareRealtime();
  const res = await fetch(`${API}/apps/${cfg.appId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.appSecret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { errorCode: "bad_response", errorDescription: text.slice(0, 200) };
  }
  const err = json as { errorCode?: string; errorDescription?: string };
  if (!res.ok || (err.errorCode && !(json as CfTracksResponse).tracks)) {
    console.error("[cf-realtime]", method, path.replace(/sessions\/[^/]+/, "sessions/…"), res.status, err.errorCode, err.errorDescription);
    throw new HttpError(502, "Falha no servidor de áudio/vídeo. Tente de novo.");
  }
  return json as T;
}

export const cf = {
  newSession: () => call<{ sessionId: string }>("POST", "/sessions/new"),
  pushTracks: (sessionId: string, offer: SessionDescription, tracks: { mid: string; trackName: string }[]) =>
    call<CfTracksResponse>("POST", `/sessions/${sessionId}/tracks/new`, {
      sessionDescription: offer,
      tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
    }),
  pullTracks: (
    sessionId: string,
    tracks: { sessionId: string; trackName: string; simulcast?: { preferredRid: string } }[],
  ) =>
    call<CfTracksResponse>("POST", `/sessions/${sessionId}/tracks/new`, {
      tracks: tracks.map((t) => ({
        location: "remote",
        sessionId: t.sessionId,
        trackName: t.trackName,
        ...(t.simulcast
          ? { simulcast: { preferredRid: t.simulcast.preferredRid, priorityOrdering: "asciibetical", ridNotAvailable: "asciibetical" } }
          : {}),
      })),
    }),
  renegotiate: (sessionId: string, answer: SessionDescription) =>
    call<CfTracksResponse>("PUT", `/sessions/${sessionId}/renegotiate`, { sessionDescription: answer }),
  closeTracks: (sessionId: string, mids: string[], offer: SessionDescription | null) =>
    call<CfTracksResponse>("PUT", `/sessions/${sessionId}/tracks/close`, {
      tracks: mids.map((mid) => ({ mid })),
      ...(offer ? { sessionDescription: offer, force: false } : { force: true }),
    }),
  updateTracks: (
    sessionId: string,
    tracks: { sessionId: string; trackName: string; mid: string; preferredRid: string }[],
  ) =>
    call<CfTracksResponse>("PUT", `/sessions/${sessionId}/tracks/update`, {
      tracks: tracks.map((t) => ({
        location: "remote",
        sessionId: t.sessionId,
        trackName: t.trackName,
        mid: t.mid,
        simulcast: { preferredRid: t.preferredRid, priorityOrdering: "asciibetical", ridNotAvailable: "asciibetical" },
      })),
    }),
};

/** Servidores STUN/TURN para o navegador (TURN só se a chave estiver configurada). */
export async function iceServers(): Promise<RTCIceServer[]> {
  const stun: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
  const cfg = serverCloudflareRealtime();
  if (!cfg.turnKeyId || !cfg.turnToken) return stun;
  try {
    const res = await fetch(`${API}/turn/keys/${cfg.turnKeyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.turnToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 43_200 }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { iceServers?: { urls: string | string[]; username?: string; credential?: string }[] };
    const list = (json.iceServers ?? []).map((s) => ({
      ...s,
      // A porta 53 costuma travar no navegador.
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    }));
    return list.length ? list : stun;
  } catch (e) {
    console.error("[cf-turn]", e instanceof Error ? e.message : e);
    return stun;
  }
}

// ---------------------------------------------------------------------------
// Passe da sessão de mídia: "<dados base64url>.<assinatura>"
// ---------------------------------------------------------------------------

export interface RtcClaims {
  /** id da sessão no Cloudflare */
  s: string;
  /** sede */
  o: string;
  /** sala de reunião (null = proximidade) */
  r: string | null;
  /** pessoa */
  u: string;
  /** expira em (ms) */
  e: number;
}

const TICKET_TTL_MS = 12 * 60 * 60 * 1000;

function sig(data: string) {
  return createHmac("sha256", serverSigningSecret()).update(`rtc:${data}`).digest("base64url");
}

export function issueRtcTicket(c: Omit<RtcClaims, "e">): string {
  const data = Buffer.from(JSON.stringify({ ...c, e: Date.now() + TICKET_TTL_MS })).toString("base64url");
  return `${data}.${sig(data)}`;
}

export function verifyRtcTicket(ticket: string | undefined | null): RtcClaims | null {
  if (!ticket || ticket.length > 600) return null;
  const [data, s] = ticket.split(".");
  if (!data || !s) return null;
  const want = Buffer.from(sig(data));
  const got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString()) as RtcClaims;
    if (typeof c.s !== "string" || typeof c.o !== "string" || typeof c.u !== "string" || c.e < Date.now()) return null;
    return c;
  } catch {
    return null;
  }
}
