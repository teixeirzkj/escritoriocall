"use client";

import { createLocalVideoTrack, type LocalVideoTrack, VideoPresets } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProximityResult } from "@/lib/game/proximity";
import type { PresenceData, RtcInfo } from "@/lib/realtime/channels";
import { setSoundsDeafened } from "@/lib/sounds";
import { type BackgroundEffect, BLUR_RADIUS, imageFor, loadEffect, saveEffect } from "./backgrounds";
import { CfSession, type LocalKind, remoteKey, type RemoteRef, RtcError } from "./cf-engine";
import type { AttachableTrack, DevicePrefs, MediaParticipant, MediaStatus, MediaTarget, VideoTile } from "./useMedia";

interface Options {
  officeId: string;
  myId: string;
  myName?: string;
  prefs: DevicePrefs;
  initialMic: boolean;
  initialCam: boolean;
  onSpeakers: (ids: Set<string>) => void;
  onError: (msg: string) => void;
  /** Quem está online (presença do Ably): de onde vêm as sessões de mídia dos outros. */
  roster?: { id: string; data: PresenceData }[];
  /** Publica a própria sessão de mídia na presença (ou null). */
  publishRtc?: (rtc: RtcInfo | null) => void;
}

/** Câmera em 720p com uma camada de 360p (quem recebe escolhe: economiza tráfego). */
const CAM_ENCODINGS: RTCRtpEncodingParameters[] = [
  { rid: "a", maxBitrate: 900_000, maxFramerate: 30 },
  { rid: "b", scaleResolutionDownBy: 2, maxBitrate: 250_000, maxFramerate: 24 },
];
/** Proximidade: quanto tempo continua recebendo depois que a pessoa se afasta. */
const LINGER_MS = 4000;
const SPEAK_LEVEL = 0.035;

/** <video> de uma faixa crua (MediaStreamTrack) no formato que os componentes usam. */
const adapters = new WeakMap<MediaStreamTrack, AttachableTrack>();
function attachable(track: MediaStreamTrack): AttachableTrack {
  let a = adapters.get(track);
  if (!a) {
    a = {
      attach(el: HTMLMediaElement) {
        el.srcObject = new MediaStream([track]);
        void el.play().catch(() => {});
        return el;
      },
      detach(el: HTMLMediaElement) {
        el.srcObject = null;
        return el;
      },
    };
    adapters.set(track, a);
  }
  return a;
}

interface RemoteEntry {
  ref: RemoteRef;
  track: MediaStreamTrack;
  audio?: HTMLAudioElement;
  analyser?: AnalyserNode;
  source?: MediaStreamAudioSourceNode;
}

function permissionMessage(e: unknown, what: string): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return `Permissão de ${what} negada no navegador.`;
  if (name === "NotFoundError") return `Nenhum(a) ${what} encontrado(a).`;
  if (name === "NotReadableError") return `O(a) ${what} está em uso por outro aplicativo.`;
  return `Não foi possível ativar o(a) ${what}.`;
}

function level(an: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

/**
 * Áudio e vídeo pelo Cloudflare Realtime (mesma interface do useMedia do LiveKit).
 * Publicar é grátis; só o que cada pessoa recebe conta no plano. Por isso:
 *  - na proximidade, recebe só de quem está perto (e para 4 s depois que se afasta);
 *  - numa sala de reunião, recebe de todos da sala;
 *  - sem nada para publicar nem receber, não abre conexão nenhuma ("standby").
 */
export function useCfMedia(opts: Options) {
  const { officeId, myId } = opts;
  const [status, setStatus] = useState<MediaStatus>("standby");
  const [target, setTarget] = useState<MediaTarget>({ kind: "proximity" });
  const [mic, setMic] = useState(opts.initialMic);
  const [cam, setCam] = useState(opts.initialCam);
  const [screen, setScreen] = useState(false);
  const [deafened, setDeafenedState] = useState(false);
  const [tiles, setTiles] = useState<VideoTile[]>([]);
  const [participants, setParticipants] = useState<MediaParticipant[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [background, setBackgroundState] = useState<BackgroundEffect>(() =>
    typeof window === "undefined" ? { mode: "none" } : loadEffect(),
  );

  const cbRef = useRef({ onSpeakers: opts.onSpeakers, onError: opts.onError, publishRtc: opts.publishRtc });
  const prefsRef = useRef(opts.prefs);
  const rosterRef = useRef(opts.roster ?? []);
  const nameRef = useRef(opts.myName ?? "Você");
  useEffect(() => {
    cbRef.current = { onSpeakers: opts.onSpeakers, onError: opts.onError, publishRtc: opts.publishRtc };
    prefsRef.current = opts.prefs;
    nameRef.current = opts.myName ?? "Você";
  });

  const targetRef = useRef<MediaTarget>({ kind: "proximity" });
  const sessionRef = useRef<CfSession | null>(null);
  const openingRef = useRef<Promise<CfSession | null> | null>(null);
  const openingTargetRef = useRef<MediaTarget | null>(null);
  const pauseRef = useRef(0);
  const tilesSigRef = useRef("");
  const partsSigRef = useRef("");
  const desiredRef = useRef({ mic: opts.initialMic, cam: opts.initialCam });
  const deafRef = useRef(false);
  const micBeforeDeafRef = useRef(false);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<LocalVideoTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const bgRef = useRef(background);
  const proximityRef = useRef<Map<string, ProximityResult>>(new Map());
  const lingerRef = useRef<Map<string, number>>(new Map());
  const remoteRef = useRef<Map<string, RemoteEntry>>(new Map());
  const failedRef = useRef<Map<string, number>>(new Map());
  const qualityRef = useRef<string>("");
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<{ an: AnalyserNode; src: MediaStreamAudioSourceNode } | null>(null);
  const rtcSigRef = useRef("");
  const wantedSigRef = useRef("");
  const retryAtRef = useRef(0);
  const loopRef = useRef({ running: false, again: false });
  const aliveRef = useRef(true);

  // Com fundo de imagem a prévia própria não é espelhada (o texto do fundo fica legível).
  useEffect(() => {
    if (background.mode === "image") document.documentElement.dataset.fundoImagem = "1";
    else delete document.documentElement.dataset.fundoImagem;
  }, [background]);

  // ---------------------------------------------------------------------------
  // Áudio: elementos <audio> ocultos + detecção de quem está falando
  // ---------------------------------------------------------------------------
  const audioCtx = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      audioCtxRef.current = new AudioContext();
    } catch {
      return null;
    }
    return audioCtxRef.current;
  }, []);

  const applyVolumes = useCallback(() => {
    const master = deafRef.current ? 0 : prefsRef.current.masterVolume;
    const inRoom = targetRef.current.kind === "room";
    for (const e of remoteRef.current.values()) {
      if (!e.audio) continue;
      const v = inRoom ? 1 : (proximityRef.current.get(e.ref.peerId)?.volume ?? 0);
      e.audio.volume = Math.max(0, Math.min(1, v * master));
    }
  }, []);

  const rebuild = useCallback(() => {
    const me = myId;
    const myName = nameRef.current;
    const next: VideoTile[] = [];
    const cam = camTrackRef.current;
    if (cam && desiredRef.current.cam) {
      next.push({ key: "local-cam", identity: me, name: myName, isLocal: true, source: "camera", track: cam });
    }
    const scr = screenTrackRef.current;
    if (scr) next.push({ key: "local-screen", identity: me, name: myName, isLocal: true, source: "screen", track: attachable(scr) });
    const nameOf = new Map(rosterRef.current.map((r) => [r.id, r.data.name]));
    const seen = new Set<string>();
    for (const [key, e] of remoteRef.current) {
      seen.add(e.ref.peerId);
      if (e.track.kind !== "video") continue;
      next.push({
        key,
        identity: e.ref.peerId,
        name: nameOf.get(e.ref.peerId) ?? "Pessoa",
        isLocal: false,
        source: e.ref.source === "screen" ? "screen" : "camera",
        track: attachable(e.track),
      });
    }
    const tsig = next.map((t) => `${t.key}|${t.name}`).join(",");
    if (tsig !== tilesSigRef.current) {
      tilesSigRef.current = tsig;
      setTiles(next);
    }

    const t = targetRef.current;
    const list: MediaParticipant[] = [
      { identity: me, name: myName, isLocal: true, mic: desiredRef.current.mic && !deafRef.current, cam: Boolean(cam && desiredRef.current.cam), screen: Boolean(scr) },
    ];
    for (const r of rosterRef.current) {
      if (r.id === me) continue;
      const together = t.kind === "room" ? r.data.roomId === t.roomId : seen.has(r.id);
      if (!together) continue;
      list.push({ identity: r.id, name: r.data.name, isLocal: false, mic: Boolean(r.data.mic), cam: Boolean(r.data.cam), screen: Boolean(r.data.screen) });
    }
    const psig = JSON.stringify(list);
    if (psig !== partsSigRef.current) {
      partsSigRef.current = psig;
      setParticipants(list);
    }
  }, [myId]);

  const detachRemote = useCallback((key: string) => {
    const e = remoteRef.current.get(key);
    if (!e) return;
    remoteRef.current.delete(key);
    if (e.audio) {
      e.audio.srcObject = null;
      e.audio.remove();
    }
    try {
      e.source?.disconnect();
    } catch {
      /* ignora */
    }
  }, []);

  const attachRemote = useCallback(
    (key: string, ref: RemoteRef, track: MediaStreamTrack) => {
      detachRemote(key);
      const e: RemoteEntry = { ref, track };
      if (track.kind === "audio") {
        const el = document.createElement("audio");
        el.autoplay = true;
        el.dataset.identity = ref.peerId;
        el.srcObject = new MediaStream([track]);
        audioHostRef.current?.appendChild(el);
        const out = prefsRef.current.audioOutputId;
        const sink = (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
        if (out && sink) void sink.call(el, out).catch(() => {});
        void el.play().catch(() => setAudioBlocked(true));
        e.audio = el;
        const ctx = audioCtx();
        if (ctx) {
          try {
            e.source = ctx.createMediaStreamSource(new MediaStream([track]));
            e.analyser = ctx.createAnalyser();
            e.analyser.fftSize = 512;
            e.source.connect(e.analyser);
          } catch {
            /* sem análise de volume */
          }
        }
      }
      remoteRef.current.set(key, e);
      applyVolumes();
      rebuild();
    },
    [audioCtx, applyVolumes, rebuild, detachRemote],
  );

  const watchLocalMic = useCallback(
    (track: MediaStreamTrack | null) => {
      try {
        micAnalyserRef.current?.src.disconnect();
      } catch {
        /* ignora */
      }
      micAnalyserRef.current = null;
      const ctx = track ? audioCtx() : null;
      if (!track || !ctx) return;
      try {
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        micAnalyserRef.current = { an, src };
      } catch {
        /* ignora */
      }
    },
    [audioCtx],
  );

  // ---------------------------------------------------------------------------
  // Sessão no Cloudflare
  // ---------------------------------------------------------------------------
  const publishRtcInfo = useCallback(() => {
    const s = sessionRef.current;
    const names = s && !s.dead ? s.publishedNames : {};
    const info: RtcInfo | null = s && Object.keys(names).length ? { s: s.sessionId, tk: s.tk, ...names } : null;
    const sig = JSON.stringify(info);
    if (sig === rtcSigRef.current) return;
    rtcSigRef.current = sig;
    cbRef.current.publishRtc?.(info);
  }, []);

  const dropAllRemote = useCallback(() => {
    for (const key of Array.from(remoteRef.current.keys())) detachRemote(key);
    qualityRef.current = "";
  }, [detachRemote]);

  const closeSession = useCallback(() => {
    const s = sessionRef.current;
    sessionRef.current = null;
    s?.close();
    dropAllRemote();
    publishRtcInfo();
    rebuild();
  }, [dropAllRemote, publishRtcInfo, rebuild]);

  // Referência estável para o laço (definido abaixo).
  const reconcileRef = useRef<() => void>(() => {});

  const ensureSession = useCallback(async (): Promise<CfSession | null> => {
    for (let i = 0; i < 3; i++) {
      const cur = sessionRef.current;
      if (cur && !cur.dead) return cur;
      if (!openingRef.current) break;
      // Já está abrindo: se for para o mesmo lugar, espera; se o alvo mudou, abre outra.
      const t0 = openingTargetRef.current;
      const r = await openingRef.current;
      if (t0 === targetRef.current) return r;
    }
    const t = targetRef.current;
    openingTargetRef.current = t;
    setStatus("connecting");
    const p = CfSession.open(officeId, t.kind === "room" ? t.roomId : undefined, t.kind === "room" ? t.ticket : undefined)
      .then((s) => {
        if (targetRef.current !== t || !aliveRef.current) {
          s.close();
          return null;
        }
        // O passe da porta vale uma vez: nas reconexões quem já está dentro entra direto.
        if (t.kind === "room" && t.ticket) targetRef.current = { kind: "room", roomId: t.roomId };
        s.onRemoteTrack = attachRemote;
        s.onDead = () => {
          if (sessionRef.current !== s) return;
          sessionRef.current = null;
          dropAllRemote();
          publishRtcInfo();
          rebuild();
          setStatus("reconnecting");
          retryAtRef.current = Date.now() + 1500;
          window.setTimeout(() => reconcileRef.current(), 1600);
        };
        sessionRef.current = s;
        retryAtRef.current = 0;
        setLastError(null);
        setStatus("connected");
        return s;
      })
      .catch((e: unknown) => {
        const err = e instanceof RtcError ? e : new RtcError(0, "Falha ao conectar o áudio/vídeo");
        if (err.status === 503) {
          setStatus("unconfigured");
          setLastError("Áudio/vídeo não configurado no servidor");
        } else {
          setStatus("error");
          setLastError(err.message);
          retryAtRef.current = Date.now() + 5000;
          if (t.kind === "room" || err.status !== 0) cbRef.current.onError(err.message);
        }
        return null;
      })
      .finally(() => {
        if (openingRef.current === p) {
          openingRef.current = null;
          openingTargetRef.current = null;
        }
      });
    openingRef.current = p;
    return p;
  }, [officeId, attachRemote, dropAllRemote, publishRtcInfo, rebuild]);

  /** Faixas que quero receber agora (de quem está perto, ou de todos da minha sala). */
  const wantedRefs = useCallback((): RemoteRef[] => {
    const t = targetRef.current;
    const now = Date.now();
    const out: RemoteRef[] = [];
    for (const { id, data } of rosterRef.current) {
      if (id === myId || !data.rtc) continue;
      let want = false;
      if (t.kind === "room") want = data.roomId === t.roomId;
      else if (!data.roomId) {
        if (proximityRef.current.get(id)?.connected) {
          lingerRef.current.set(id, now);
          want = true;
        } else want = now - (lingerRef.current.get(id) ?? 0) < LINGER_MS;
      }
      if (!want) continue;
      for (const source of ["mic", "cam", "screen"] as LocalKind[]) {
        const trackName = data.rtc[source];
        if (!trackName) continue;
        // "Silenciar tudo": nem recebe o áudio dos outros.
        if (source === "mic" && deafRef.current) continue;
        out.push({ peerId: id, session: data.rtc.s, tk: data.rtc.tk, trackName, source });
      }
    }
    return out;
  }, [myId]);

  /** Qualidade da câmera recebida: alta com poucas câmeras numa sala; senão, a camada leve. */
  const camRid = useCallback((): "a" | "b" => {
    const t = targetRef.current;
    if (t.kind !== "room") return "b";
    const cams = rosterRef.current.filter((r) => r.id !== myId && r.data.roomId === t.roomId && r.data.rtc?.cam).length;
    return cams > 4 ? "b" : "a";
  }, [myId]);

  /** Publica/para de publicar microfone, câmera e tela conforme o estado atual. */
  const syncLocal = useCallback(
    async (s: CfSession) => {
      const camOn = desiredRef.current.cam && camTrackRef.current;
      const micTrack = micTrackRef.current;
      const camTrack = camOn ? camTrackRef.current!.mediaStreamTrack : null;
      const scrTrack = screenTrackRef.current;
      if (micTrack && !s.has("mic")) await s.push("mic", micTrack);
      if (!micTrack && s.has("mic")) await s.unpush("mic");
      if (camTrack && !s.has("cam")) await s.push("cam", camTrack, { encodings: CAM_ENCODINGS });
      if (!camTrack && s.has("cam")) await s.unpush("cam");
      if (scrTrack && !s.has("screen")) {
        await s.push("screen", scrTrack, {
          encodings: [{ maxBitrate: 3_000_000, maxFramerate: 30 }],
          codec: "video/H264",
          degradation: "balanced",
        });
      }
      if (!scrTrack && s.has("screen")) await s.unpush("screen");
      publishRtcInfo();
    },
    [publishRtcInfo],
  );

  const reconcileOnce = useCallback(async () => {
    if (Date.now() < pauseRef.current) return;
    const wanted = wantedRefs();
    const camOn = desiredRef.current.cam && camTrackRef.current;
    const needLocal = Boolean(micTrackRef.current || camOn || screenTrackRef.current);
    const needSession = needLocal || wanted.length > 0;
    let s = sessionRef.current && !sessionRef.current.dead ? sessionRef.current : null;
    if (!needSession) {
      if (s || sessionRef.current) closeSession();
      if (!openingRef.current) setStatus((st) => (st === "unconfigured" ? st : "standby"));
      return;
    }
    if (!s) {
      if (Date.now() < retryAtRef.current) return;
      s = await ensureSession();
      if (!s) return;
    }
    // Publicar
    await syncLocal(s);
    // Receber
    const wantedKeys = new Set(wanted.map(remoteKey));
    const stale = s.pulledKeys.filter((k) => !wantedKeys.has(k));
    if (stale.length) {
      await s.unpull(stale);
      for (const k of stale) detachRemote(k);
    }
    const now = Date.now();
    const todo = wanted.filter((r) => !s!.isPulling(remoteKey(r)) && now - (failedRef.current.get(remoteKey(r)) ?? 0) > 3000);
    if (todo.length) {
      const rid = camRid();
      const failed = await s.pull(todo, (r) => (r.source === "cam" ? rid : undefined));
      for (const k of failed) failedRef.current.set(k, now);
    }
    // Qualidade das câmeras recebidas
    const rid = camRid();
    const camKeys = wanted.filter((r) => r.source === "cam" && s!.isPulling(remoteKey(r))).map(remoteKey);
    const qsig = `${rid}:${camKeys.join(",")}`;
    if (camKeys.length && qsig !== qualityRef.current) {
      qualityRef.current = qsig;
      await s.setQuality(camKeys.map((key) => ({ key, rid })));
    }
    rebuild();
  }, [wantedRefs, closeSession, ensureSession, syncLocal, detachRemote, camRid, rebuild]);

  const reconcile = useCallback(async () => {
    const loop = loopRef.current;
    if (loop.running) {
      loop.again = true;
      return;
    }
    loop.running = true;
    try {
      do {
        loop.again = false;
        try {
          await reconcileOnce();
        } catch (e) {
          // Erro de uma sessão que já foi trocada (entrou/saiu de sala): só segue.
          if (e instanceof RtcError && e.status === -1) continue;
          const s = sessionRef.current;
          if (e instanceof RtcError && e.status === 401 && s) {
            // Passe expirado: abre outra sessão.
            closeSession();
          } else if (s && !s.dead) {
            setLastError(e instanceof Error ? e.message : String(e));
          }
          retryAtRef.current = Math.max(retryAtRef.current, Date.now() + 1500);
          pauseRef.current = Date.now() + 2500;
        }
      } while (loop.again && aliveRef.current);
    } finally {
      loop.running = false;
    }
  }, [reconcileOnce, closeSession]);

  useEffect(() => {
    reconcileRef.current = () => void reconcile();
  }, [reconcile]);

  // Presença mudou (alguém publicou, entrou na sala...): revisa o que receber.
  useEffect(() => {
    rosterRef.current = opts.roster ?? [];
    void reconcile();
  }, [opts.roster, reconcile]);

  // Laço de manutenção + detecção de quem fala.
  useEffect(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    host.setAttribute("data-cf-audio", "");
    document.body.appendChild(host);
    audioHostRef.current = host;
    aliveRef.current = true;
    const remote = remoteRef.current;

    const loop = window.setInterval(() => void reconcile(), 1000);
    const buf = new Uint8Array(512);
    let last = "";
    const speak = window.setInterval(() => {
      const ids = new Set<string>();
      for (const e of remoteRef.current.values()) {
        if (e.analyser && level(e.analyser, buf) > SPEAK_LEVEL) ids.add(e.ref.peerId);
      }
      const m = micAnalyserRef.current;
      if (m && desiredRef.current.mic && !deafRef.current && level(m.an, buf) > SPEAK_LEVEL) ids.add(myId);
      const sig = Array.from(ids).sort().join(",");
      if (sig !== last) {
        last = sig;
        cbRef.current.onSpeakers(ids);
      }
    }, 250);
    // O navegador só libera o áudio depois de um clique.
    const unlock = () => void audioCtxRef.current?.resume().catch(() => {});
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      aliveRef.current = false;
      window.clearInterval(loop);
      window.clearInterval(speak);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      const s = sessionRef.current;
      sessionRef.current = null;
      s?.close();
      for (const key of Array.from(remote.keys())) detachRemote(key);
      micTrackRef.current?.stop();
      micTrackRef.current = null;
      camTrackRef.current?.stop();
      camTrackRef.current = null;
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      void audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      host.remove();
      audioHostRef.current = null;
    };
  }, [reconcile, detachRemote, myId]);

  // Registro de uso: tráfego recebido (o que o Cloudflare cobra) e minutos em conversa.
  useEffect(() => {
    let lastSession = "";
    let lastBytes = 0;
    const t = window.setInterval(async () => {
      const s = sessionRef.current;
      if (!s || s.dead) return;
      const total = await s.bytesReceived();
      if (s.sessionId !== lastSession) {
        lastSession = s.sessionId;
        lastBytes = 0;
      }
      const bytes = Math.max(0, total - lastBytes);
      lastBytes = total;
      if (!bytes && !s.pulledKeys.length) return;
      void fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, kind: targetRef.current.kind === "room" ? "meeting" : "proximity", bytes }),
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(t);
  }, [officeId]);

  // ---------------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------------
  const applyBackground = useCallback(async () => {
    const track = camTrackRef.current;
    if (!track) return;
    const eff = bgRef.current;
    try {
      const current = track.getProcessor();
      if (eff.mode === "none") {
        if (current) await track.stopProcessor();
      } else {
        const mod = await import("@livekit/track-processors");
        if (!mod.supportsBackgroundProcessors()) {
          cbRef.current.onError("Seu navegador não suporta efeitos de fundo. Use o Chrome ou o Edge atualizados.");
          return;
        }
        let o: import("@livekit/track-processors").SwitchBackgroundProcessorOptions;
        if (eff.mode === "blur") o = { mode: "background-blur", blurRadius: BLUR_RADIUS[eff.strength] };
        else {
          const src = imageFor(eff.id);
          if (!src) {
            cbRef.current.onError("Imagem de fundo não encontrada. Escolha outra.");
            return;
          }
          o = { mode: "virtual-background", imagePath: src };
        }
        if (current instanceof mod.BackgroundProcessorWrapper) await current.switchTo(o);
        else {
          if (current) await track.stopProcessor();
          await track.setProcessor(mod.BackgroundProcessor(o));
        }
      }
      // A faixa enviada passa a ser a processada (ou a original).
      await sessionRef.current?.replace("cam", track.mediaStreamTrack);
    } catch {
      cbRef.current.onError("Não foi possível aplicar o efeito de fundo.");
    }
    rebuild();
  }, [rebuild]);

  const setBackground = useCallback(
    (e: BackgroundEffect) => {
      bgRef.current = e;
      setBackgroundState(e);
      saveEffect(e);
      return applyBackground();
    },
    [applyBackground],
  );

  const audioConstraints = (deviceId?: string | null): MediaTrackConstraints => ({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
  });

  const setMicEnabled = useCallback(
    async (next: boolean) => {
      desiredRef.current.mic = next;
      setMic(next);
      if (next) {
        const cur = micTrackRef.current;
        if (!cur || cur.readyState === "ended") {
          try {
            const st = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(prefsRef.current.audioInputId) });
            micTrackRef.current = st.getAudioTracks()[0] ?? null;
            watchLocalMic(micTrackRef.current);
          } catch (e) {
            desiredRef.current.mic = false;
            setMic(false);
            cbRef.current.onError(permissionMessage(e, "microfone"));
            return false;
          }
        }
        if (micTrackRef.current) micTrackRef.current.enabled = true;
      } else if (micTrackRef.current) {
        micTrackRef.current.enabled = false;
      }
      void reconcile();
      rebuild();
      return next;
    },
    [reconcile, rebuild, watchLocalMic],
  );

  const setDeaf = useCallback(
    (on: boolean) => {
      deafRef.current = on;
      setDeafenedState(on);
      setSoundsDeafened(on);
      applyVolumes();
      void reconcile();
    },
    [applyVolumes, reconcile],
  );

  const toggleMic = useCallback(async () => {
    const next = !desiredRef.current.mic;
    if (next && deafRef.current) setDeaf(false);
    return setMicEnabled(next);
  }, [setMicEnabled, setDeaf]);

  const toggleDeafen = useCallback(async () => {
    if (!deafRef.current) {
      micBeforeDeafRef.current = desiredRef.current.mic;
      setDeaf(true);
      if (desiredRef.current.mic) await setMicEnabled(false);
    } else {
      setDeaf(false);
      if (micBeforeDeafRef.current) await setMicEnabled(true);
    }
  }, [setDeaf, setMicEnabled]);

  const toggleCam = useCallback(async () => {
    const next = !desiredRef.current.cam;
    desiredRef.current.cam = next;
    setCam(next);
    if (next) {
      try {
        camTrackRef.current?.stop();
        camTrackRef.current = await createLocalVideoTrack({
          resolution: VideoPresets.h720.resolution,
          deviceId: prefsRef.current.videoInputId ?? undefined,
        });
        if (bgRef.current.mode !== "none") await applyBackground();
      } catch (e) {
        desiredRef.current.cam = false;
        setCam(false);
        camTrackRef.current = null;
        cbRef.current.onError(permissionMessage(e, "câmera"));
        rebuild();
        return false;
      }
    } else {
      camTrackRef.current?.stop();
      camTrackRef.current = null;
    }
    void reconcile();
    rebuild();
    return next;
  }, [applyBackground, reconcile, rebuild]);

  const toggleScreen = useCallback(async () => {
    const cur = screenTrackRef.current;
    if (cur) {
      cur.stop();
      screenTrackRef.current = null;
      setScreen(false);
      void reconcile();
      rebuild();
      return false;
    }
    try {
      const st = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const track = st.getVideoTracks()[0];
      if (!track) return false;
      // Texto nítido: o navegador prefere manter a resolução e baixar os quadros.
      track.contentHint = "detail";
      track.addEventListener("ended", () => {
        if (screenTrackRef.current !== track) return;
        screenTrackRef.current = null;
        setScreen(false);
        void reconcile();
        rebuild();
      });
      screenTrackRef.current = track;
      setScreen(true);
      void reconcile();
      rebuild();
      return true;
    } catch (e) {
      setScreen(false);
      const name = e instanceof Error ? e.name : "";
      if (name !== "NotAllowedError") cbRef.current.onError("Não foi possível compartilhar a tela");
      return false;
    }
  }, [reconcile, rebuild]);

  /** Recebe o resultado do cálculo de proximidade (modo proximity). */
  const setProximity = useCallback(
    (results: ProximityResult[]) => {
      const m = new Map<string, ProximityResult>();
      for (const r of results) m.set(r.id, r);
      proximityRef.current = m;
      applyVolumes();
      const sig = wantedRefs().map(remoteKey).sort().join(",");
      if (sig !== wantedSigRef.current) {
        wantedSigRef.current = sig;
        void reconcile();
      }
    },
    [applyVolumes, wantedRefs, reconcile],
  );

  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      try {
        if (kind === "audiooutput") {
          for (const e of remoteRef.current.values()) {
            const el = e.audio as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | undefined;
            await el?.setSinkId?.(deviceId);
          }
        } else if (kind === "audioinput") {
          const old = micTrackRef.current;
          if (!old) return;
          const st = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
          const track = st.getAudioTracks()[0];
          if (!track) return;
          track.enabled = desiredRef.current.mic;
          await sessionRef.current?.replace("mic", track);
          micTrackRef.current = track;
          watchLocalMic(track);
          old.stop();
        } else if (kind === "videoinput") {
          const t = camTrackRef.current;
          if (!t) return;
          await t.restartTrack({ deviceId });
          await sessionRef.current?.replace("cam", t.mediaStreamTrack);
          rebuild();
        }
      } catch {
        cbRef.current.onError("Não foi possível trocar o dispositivo");
      }
    },
    [rebuild, watchLocalMic],
  );

  const startAudio = useCallback(async () => {
    await audioCtxRef.current?.resume().catch(() => {});
    let blocked = false;
    for (const e of remoteRef.current.values()) {
      if (e.audio) await e.audio.play().catch(() => (blocked = true));
    }
    setAudioBlocked(blocked);
  }, []);

  /** Entra numa sala de reunião (valida acesso, porta trancada e lotação no servidor). */
  const joinMeeting = useCallback(
    async (roomId: string, ticket?: string) => {
      const t: MediaTarget = { kind: "room", roomId, ticket };
      targetRef.current = t;
      setTarget(t);
      closeSession();
      retryAtRef.current = 0;
      pauseRef.current = 0;
      const s = await ensureSession();
      if (!s) {
        targetRef.current = { kind: "proximity" };
        setTarget({ kind: "proximity" });
        setStatus("standby");
        return false;
      }
      applyVolumes();
      // Já publica antes de voltar: o aviso "entrei na sala" sai junto com a sessão nova.
      try {
        await syncLocal(s);
      } catch {
        /* o laço tenta de novo */
      }
      void reconcile();
      return true;
    },
    [closeSession, ensureSession, applyVolumes, syncLocal, reconcile],
  );

  const leaveMeeting = useCallback(async () => {
    targetRef.current = { kind: "proximity" };
    setTarget({ kind: "proximity" });
    closeSession();
    setStatus("standby");
    void reconcile();
    return true;
  }, [closeSession, reconcile]);

  const retry = useCallback(() => {
    retryAtRef.current = 0;
    pauseRef.current = 0;
    setLastError(null);
    if (sessionRef.current?.dead) sessionRef.current = null;
    void reconcile();
    return Promise.resolve(true);
  }, [reconcile]);

  /** Recomeça a sessão (ex.: alguém perdeu o acesso à sala; os passes antigos deixam de valer). */
  const resetSession = useCallback(() => {
    closeSession();
    retryAtRef.current = 0;
    void reconcile();
  }, [closeSession, reconcile]);

  // Começa com o microfone/câmera ligados, se a pessoa configurou assim.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (desiredRef.current.mic) {
        desiredRef.current.mic = false;
        void setMicEnabled(true);
      }
      if (desiredRef.current.cam) {
        desiredRef.current.cam = false;
        void toggleCam();
      }
    }, 0);
    return () => window.clearTimeout(t);
    // Só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    target,
    mic,
    cam,
    screen,
    tiles,
    participants,
    audioBlocked,
    lastError,
    background,
    setBackground,
    toggleMic,
    deafened,
    toggleDeafen,
    toggleCam,
    toggleScreen,
    setProximity,
    applyVolumes,
    switchDevice,
    startAudio,
    joinMeeting,
    leaveMeeting,
    retry,
    resetSession,
  };
}
