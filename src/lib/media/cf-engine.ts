/**
 * Conexão com o Cloudflare Realtime (SFU): uma RTCPeerConnection por pessoa.
 * - publicar (push): microfone, câmera e tela saem por transceivers "sendonly";
 * - receber (pull): faixas de outras pessoas entram por transceivers "recvonly".
 * Toda negociação passa pela rota /api/rtc (o App Secret fica no servidor) e é
 * feita em fila, uma de cada vez, como o Cloudflare exige.
 */

export type LocalKind = "mic" | "cam" | "screen";

/** Uma faixa publicada por outra pessoa. */
export interface RemoteRef {
  peerId: string;
  /** sessão do Cloudflare de quem publica */
  session: string;
  /** passe da sessão de quem publica (o servidor confere sede e sala) */
  tk: string;
  trackName: string;
  source: LocalKind;
}

export const remoteKey = (r: { session: string; trackName: string }) => `${r.session}/${r.trackName}`;

export class RtcError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}
interface TracksResponse {
  requiresImmediateRenegotiation?: boolean;
  sessionDescription?: SessionDescription;
  tracks?: { mid?: string; trackName?: string; sessionId?: string; errorCode?: string; errorDescription?: string }[];
}

async function rtcApi<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new RtcError(0, "Sem conexão com o servidor");
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new RtcError(res.status, json.error ?? `Erro ${res.status}`);
  return json as T;
}

/** Áudio com DTX: em silêncio quase não manda dados (menos tráfego para quem recebe). */
export function withDtx(sdp: string): string {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!m) return sdp;
  const pt = m[1];
  return sdp.replace(new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`), (line, params: string) =>
    /usedtx=/.test(params) ? line : `a=fmtp:${pt} ${params};usedtx=1`,
  );
}

function preferCodec(tr: RTCRtpTransceiver, mime: string) {
  try {
    const caps = RTCRtpSender.getCapabilities?.("video")?.codecs ?? [];
    const first = caps.filter((c) => c.mimeType.toLowerCase() === mime.toLowerCase());
    if (!first.length) return;
    tr.setCodecPreferences([...first, ...caps.filter((c) => c.mimeType.toLowerCase() !== mime.toLowerCase())]);
  } catch {
    /* navegador sem suporte: fica o padrão */
  }
}

export interface PushOptions {
  /** Camadas do simulcast (câmera). */
  encodings?: RTCRtpEncodingParameters[];
  /** Codec preferido (ex.: "video/H264" para a tela). */
  codec?: string;
  degradation?: RTCDegradationPreference;
}

interface RemoteEntry {
  ref: RemoteRef;
  mid: string;
  track?: MediaStreamTrack;
  rid?: string;
}

export class CfSession {
  readonly pc: RTCPeerConnection;
  private queue: Promise<unknown> = Promise.resolve();
  private local = new Map<LocalKind, { transceiver: RTCRtpTransceiver; name: string }>();
  private remote = new Map<string, RemoteEntry>();
  private byMid = new Map<string, string>();
  private counter = 0;
  private downTimer: number | null = null;
  dead = false;

  onRemoteTrack: (key: string, ref: RemoteRef, track: MediaStreamTrack) => void = () => {};
  onDead: () => void = () => {};

  private constructor(
    readonly sessionId: string,
    readonly tk: string,
    iceServers: RTCIceServer[],
  ) {
    this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
    this.pc.ontrack = (ev) => {
      const mid = ev.transceiver.mid;
      const key = mid ? this.byMid.get(mid) : undefined;
      const e = key ? this.remote.get(key) : undefined;
      if (!key || !e) return;
      e.track = ev.track;
      this.onRemoteTrack(key, e.ref, ev.track);
    };
    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      if (st === "connected") {
        if (this.downTimer !== null) window.clearTimeout(this.downTimer);
        this.downTimer = null;
      } else if (st === "failed" || st === "closed") {
        this.kill();
      } else if (st === "disconnected" && this.downTimer === null) {
        // Pode voltar sozinha (troca de rede); se não voltar em 8 s, recomeça.
        this.downTimer = window.setTimeout(() => {
          this.downTimer = null;
          if (this.pc.connectionState !== "connected") this.kill();
        }, 8000);
      }
    };
  }

  /** Abre uma sessão: proximidade (sem roomId) ou sala de reunião. */
  static async open(officeId: string, roomId?: string, knock?: string): Promise<CfSession> {
    const r = await rtcApi<{ sessionId: string; tk: string; iceServers: RTCIceServer[] }>({ op: "session", officeId, roomId, knock });
    return new CfSession(r.sessionId, r.tk, r.iceServers);
  }

  private kill() {
    if (this.dead) return;
    this.dead = true;
    try {
      this.pc.close();
    } catch {
      /* já fechada */
    }
    this.onDead();
  }

  close() {
    this.onDead = () => {};
    this.kill();
  }

  /** Executa negociações em fila (uma por vez). */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(() => {
      if (this.dead) throw new RtcError(-1, "Sessão encerrada");
      return fn();
    });
    this.queue = p.catch(() => {});
    return p;
  }

  private async iceReady() {
    if (this.pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const pc = this.pc;
      const onChange = () => pc.iceGatheringState === "complete" && done();
      const t = window.setTimeout(done, 1200);
      function done() {
        window.clearTimeout(t);
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
      pc.addEventListener("icegatheringstatechange", onChange);
    });
  }

  /** Falhou no meio de uma negociação: tenta desfazer; se não der, recomeça a sessão. */
  private async recover() {
    try {
      if (this.pc.signalingState !== "stable") await this.pc.setLocalDescription({ type: "rollback" });
    } catch {
      this.kill();
    }
  }

  private async applyRemoteOffer(res: TracksResponse) {
    if (!res.requiresImmediateRenegotiation || !res.sessionDescription) return;
    await this.pc.setRemoteDescription(res.sessionDescription);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.iceReady();
    await rtcApi({ op: "renegotiate", tk: this.tk, answer: { type: "answer", sdp: this.pc.localDescription!.sdp } });
  }

  get publishedNames(): Partial<Record<LocalKind, string>> {
    const out: Partial<Record<LocalKind, string>> = {};
    for (const [k, v] of this.local) out[k] = v.name;
    return out;
  }

  has(kind: LocalKind) {
    return this.local.has(kind);
  }

  /** Publica uma faixa local. Devolve o nome da faixa (para quem for receber). */
  push(kind: LocalKind, track: MediaStreamTrack, opts: PushOptions = {}): Promise<string> {
    return this.run(async () => {
      const name = `${kind}-${++this.counter}`;
      const tr = this.pc.addTransceiver(track, { direction: "sendonly", sendEncodings: opts.encodings });
      if (opts.codec) preferCodec(tr, opts.codec);
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.iceReady();
        const res = await rtcApi<TracksResponse>({
          op: "push",
          tk: this.tk,
          offer: { type: "offer", sdp: this.pc.localDescription!.sdp },
          tracks: [{ mid: tr.mid!, trackName: name }],
        });
        const err = res.tracks?.find((t) => t.errorCode);
        if (err || !res.sessionDescription) throw new RtcError(502, err?.errorDescription ?? "Falha ao publicar");
        await this.pc.setRemoteDescription({ type: "answer", sdp: withDtx(res.sessionDescription.sdp) });
      } catch (e) {
        await this.recover();
        try {
          tr.stop();
        } catch {
          /* ignora */
        }
        throw e;
      }
      if (opts.degradation) {
        try {
          const p = tr.sender.getParameters();
          p.degradationPreference = opts.degradation;
          await tr.sender.setParameters(p);
        } catch {
          /* opcional */
        }
      }
      this.local.set(kind, { transceiver: tr, name });
      return name;
    });
  }

  /** Troca a faixa publicada sem renegociar (outro microfone/câmera, efeito de fundo). */
  async replace(kind: LocalKind, track: MediaStreamTrack | null) {
    const e = this.local.get(kind);
    if (e) await e.transceiver.sender.replaceTrack(track);
  }

  /** Deixa de publicar uma faixa. */
  unpush(kind: LocalKind): Promise<void> {
    return this.run(async () => {
      const e = this.local.get(kind);
      if (!e) return;
      this.local.delete(kind);
      const mid = e.transceiver.mid;
      try {
        e.transceiver.stop();
      } catch {
        /* ignora */
      }
      if (!mid) return;
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.iceReady();
        const res = await rtcApi<TracksResponse>({ op: "close", tk: this.tk, mids: [mid], offer: { type: "offer", sdp: this.pc.localDescription!.sdp } });
        if (res.sessionDescription) await this.pc.setRemoteDescription(res.sessionDescription);
      } catch {
        await this.recover();
      }
    });
  }

  isPulling(key: string) {
    return this.remote.has(key);
  }

  get pulledKeys(): string[] {
    return Array.from(this.remote.keys());
  }

  /** Recebe faixas de outras pessoas. Devolve as que o Cloudflare recusou (tentar depois). */
  pull(refs: RemoteRef[], ridOf: (ref: RemoteRef) => string | undefined): Promise<string[]> {
    return this.run(async () => {
      const todo = refs.filter((r) => !this.remote.has(remoteKey(r)));
      if (!todo.length) return [];
      const res = await rtcApi<TracksResponse & { rejected?: { session: string | null; trackName: string }[] }>({
        op: "pull",
        tk: this.tk,
        tracks: todo.map((r) => ({ tk: r.tk, trackName: r.trackName, rid: ridOf(r) })),
      });
      const failed: string[] = [];
      for (const r of res.rejected ?? []) {
        const ref = todo.find((x) => x.session === r.session && x.trackName === r.trackName);
        if (ref) failed.push(remoteKey(ref));
      }
      for (const t of res.tracks ?? []) {
        const ref = todo.find((r) => r.session === t.sessionId && r.trackName === t.trackName);
        if (!ref) continue;
        if (t.errorCode || !t.mid) {
          failed.push(remoteKey(ref));
          continue;
        }
        const key = remoteKey(ref);
        this.remote.set(key, { ref, mid: t.mid, rid: ridOf(ref) });
        this.byMid.set(t.mid, key);
      }
      try {
        await this.applyRemoteOffer(res);
      } catch (e) {
        await this.recover();
        throw e;
      }
      return failed;
    });
  }

  /** Para de receber faixas. */
  unpull(keys: string[]): Promise<void> {
    return this.run(async () => {
      const mids: string[] = [];
      for (const key of keys) {
        const e = this.remote.get(key);
        if (!e) continue;
        this.remote.delete(key);
        this.byMid.delete(e.mid);
        mids.push(e.mid);
        const tr = this.pc.getTransceivers().find((t) => t.mid === e.mid);
        try {
          tr?.stop();
        } catch {
          /* ignora */
        }
      }
      if (!mids.length) return;
      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.iceReady();
        const res = await rtcApi<TracksResponse>({ op: "close", tk: this.tk, mids, offer: { type: "offer", sdp: this.pc.localDescription!.sdp } });
        if (res.sessionDescription) await this.pc.setRemoteDescription(res.sessionDescription);
      } catch {
        await this.recover();
      }
    });
  }

  /** Troca a camada (qualidade) de vídeos recebidos com simulcast. */
  setQuality(changes: { key: string; rid: string }[]): Promise<void> {
    return this.run(async () => {
      const list = changes
        .map((c) => ({ c, e: this.remote.get(c.key) }))
        .filter((x): x is { c: { key: string; rid: string }; e: RemoteEntry } => Boolean(x.e && x.e.rid && x.e.rid !== x.c.rid));
      if (!list.length) return;
      const res = await rtcApi<TracksResponse>({
        op: "quality",
        tk: this.tk,
        tracks: list.map(({ c, e }) => ({ tk: e.ref.tk, trackName: e.ref.trackName, mid: e.mid, rid: c.rid })),
      });
      for (const { c, e } of list) e.rid = c.rid;
      try {
        await this.applyRemoteOffer(res);
      } catch {
        await this.recover();
      }
    });
  }

  /** Bytes recebidos pela conexão até agora (para medir o tráfego que o Cloudflare cobra). */
  async bytesReceived(): Promise<number> {
    let total = 0;
    try {
      const stats = await this.pc.getStats();
      stats.forEach((s) => {
        if (s.type === "transport" && typeof s.bytesReceived === "number") total += s.bytesReceived;
      });
    } catch {
      /* sem estatísticas */
    }
    return total;
  }
}
