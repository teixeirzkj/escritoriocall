"use client";

import {
  DisconnectReason,
  type LocalTrackPublication,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProximityResult } from "@/lib/game/proximity";
import { setSoundsDeafened } from "@/lib/sounds";
import { type BackgroundEffect, BLUR_RADIUS, imageFor, loadEffect, saveEffect } from "./backgrounds";

export type MediaStatus =
  | "idle"
  /** Proximidade sem ninguém por perto: desconectado do LiveKit (não gasta minutos). */
  | "standby"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "unconfigured"
  | "duplicate";

export type MediaTarget = { kind: "proximity" } | { kind: "room"; roomId: string; ticket?: string };

export interface VideoTile {
  key: string;
  identity: string;
  name: string;
  isLocal: boolean;
  source: "camera" | "screen";
  track: Track;
}

export interface MediaParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

export interface DevicePrefs {
  audioInputId: string | null;
  videoInputId: string | null;
  audioOutputId: string | null;
  masterVolume: number;
}

interface Options {
  officeId: string;
  myId: string;
  prefs: DevicePrefs;
  initialMic: boolean;
  initialCam: boolean;
  onSpeakers: (ids: Set<string>) => void;
  onError: (msg: string) => void;
}

/**
 * Gerencia a conexão LiveKit do escritório.
 * Há sempre no máximo UMA sala conectada:
 *  - modo "proximity": sala do escritório com assinatura seletiva por distância. Só conecta
 *    quando alguém está chegando perto (ou a pessoa compartilha a tela); sozinho, fica em
 *    "standby", sem gastar minutos do LiveKit;
 *  - modo "room": sala de reunião isolada (quem está fora não ouve).
 */
export function useMedia(opts: Options) {
  const { officeId } = opts;
  const [status, setStatus] = useState<MediaStatus>("idle");
  const [target, setTarget] = useState<MediaTarget>({ kind: "proximity" });
  const [mic, setMic] = useState(opts.initialMic);
  const [cam, setCam] = useState(opts.initialCam);
  const [screen, setScreen] = useState(false);
  /** "Silenciar tudo": ninguém é ouvido e o microfone fica desligado. */
  const [deafened, setDeafenedState] = useState(false);
  const deafRef = useRef(false);
  const micBeforeDeafRef = useRef(false);
  const [tiles, setTiles] = useState<VideoTile[]>([]);
  const [participants, setParticipants] = useState<MediaParticipant[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [background, setBackgroundState] = useState<BackgroundEffect>(() =>
    typeof window === "undefined" ? { mode: "none" } : loadEffect(),
  );
  const bgRef = useRef(background);

  // Com fundo de imagem a prévia própria não é espelhada (o texto do fundo fica legível).
  useEffect(() => {
    if (background.mode === "image") document.documentElement.dataset.fundoImagem = "1";
    else delete document.documentElement.dataset.fundoImagem;
  }, [background]);

  const roomRef = useRef<Room | null>(null);
  const desiredRef = useRef({ mic: opts.initialMic, cam: opts.initialCam });
  const proximityRef = useRef<Map<string, ProximityResult>>(new Map());
  const targetRef = useRef<MediaTarget>({ kind: "proximity" });
  const prefsRef = useRef(opts.prefs);
  const cbRef = useRef({ onSpeakers: opts.onSpeakers, onError: opts.onError });
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const connectSeq = useRef(0);
  const retryRef = useRef(0);
  const connectRef = useRef<((t: MediaTarget) => Promise<boolean>) | null>(null);
  /** Conexão em andamento (evita abrir duas ao mesmo tempo). */
  const connectingRef = useRef(false);
  /** Proximidade: alguém chegando perto agora. */
  const anyoneNearRef = useRef(false);
  /** Compartilhando a tela: mantém conectado mesmo sem ninguém por perto. */
  const screenRef = useRef(false);
  /** Desconexão adiada quando todo mundo se afasta (evita liga/desliga). */
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    cbRef.current = { onSpeakers: opts.onSpeakers, onError: opts.onError };
    prefsRef.current = opts.prefs;
  });

  // Contêiner oculto para os elementos <audio> remotos.
  useEffect(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    host.setAttribute("data-livekit-audio", "");
    document.body.appendChild(host);
    audioHostRef.current = host;
    return () => {
      host.remove();
      audioHostRef.current = null;
    };
  }, []);

  const rebuild = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setTiles([]);
      setParticipants([]);
      return;
    }
    const nextTiles: VideoTile[] = [];
    const list: MediaParticipant[] = [];
    const add = (p: Participant, isLocal: boolean) => {
      const camPub = p.getTrackPublication(Track.Source.Camera);
      const scrPub = p.getTrackPublication(Track.Source.ScreenShare);
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const name = p.name || p.identity;
      if (camPub?.track && !camPub.isMuted) {
        nextTiles.push({ key: `${p.identity}:cam`, identity: p.identity, name, isLocal, source: "camera", track: camPub.track });
      }
      if (scrPub?.track) {
        nextTiles.push({ key: `${p.identity}:scr`, identity: p.identity, name, isLocal, source: "screen", track: scrPub.track });
      }
      list.push({
        identity: p.identity,
        name,
        isLocal,
        mic: Boolean(micPub && !micPub.isMuted),
        cam: Boolean(camPub && !camPub.isMuted),
        screen: Boolean(scrPub),
      });
    };
    add(room.localParticipant, true);
    for (const p of room.remoteParticipants.values()) add(p, false);
    setTiles(nextTiles);
    setParticipants(list);
  }, []);

  /** Aplica assinatura/volume por proximidade a um participante remoto. */
  const applyFor = useCallback((p: RemoteParticipant) => {
    const master = deafRef.current ? 0 : prefsRef.current.masterVolume;
    if (targetRef.current.kind === "room") {
      p.setVolume(master);
      return;
    }
    const res = proximityRef.current.get(p.identity);
    const want = Boolean(res?.connected);
    for (const pub of p.trackPublications.values()) {
      if (pub.isDesired !== want) pub.setSubscribed(want);
    }
    p.setVolume((res?.volume ?? 0) * master);
  }, []);

  const applyAll = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) applyFor(p);
  }, [applyFor]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect(true).catch(() => {});
    }
    audioHostRef.current?.replaceChildren();
    setScreen(false);
    cbRef.current.onSpeakers(new Set());
    rebuild();
  }, [rebuild]);

  /** Aplica o efeito de fundo escolhido na câmera local (desfoque / imagem / nenhum). */
  const applyBackground = useCallback(async () => {
    const room = roomRef.current;
    const track = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const eff = bgRef.current;
    try {
      const current = track.getProcessor();
      if (eff.mode === "none") {
        if (current) await track.stopProcessor();
        return;
      }
      const mod = await import("@livekit/track-processors");
      if (!mod.supportsBackgroundProcessors()) {
        cbRef.current.onError("Seu navegador não suporta efeitos de fundo. Use o Chrome ou o Edge atualizados.");
        return;
      }
      let opts: import("@livekit/track-processors").SwitchBackgroundProcessorOptions;
      if (eff.mode === "blur") {
        opts = { mode: "background-blur", blurRadius: BLUR_RADIUS[eff.strength] };
      } else {
        const src = imageFor(eff.id);
        if (!src) {
          cbRef.current.onError("Imagem de fundo não encontrada. Escolha outra.");
          return;
        }
        opts = { mode: "virtual-background", imagePath: src };
      }
      if (current instanceof mod.BackgroundProcessorWrapper) {
        await current.switchTo(opts);
      } else {
        if (current) await track.stopProcessor();
        await track.setProcessor(mod.BackgroundProcessor(opts));
      }
    } catch {
      cbRef.current.onError("Não foi possível aplicar o efeito de fundo.");
    }
  }, []);

  const setBackground = useCallback(
    (e: BackgroundEffect) => {
      bgRef.current = e;
      setBackgroundState(e);
      saveEffect(e);
      return applyBackground();
    },
    [applyBackground],
  );

  const connectInner = useCallback(
    async (t: MediaTarget, seq: number): Promise<boolean> => {
      await disconnect();
      if (seq !== connectSeq.current) return false;
      setStatus("connecting");
      setLastError(null);

      let tokenRes: Response;
      try {
        tokenRes = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            t.kind === "room"
              ? { kind: "room", officeId, roomId: t.roomId, ticket: t.ticket }
              : { kind: "proximity", officeId },
          ),
        });
      } catch {
        setStatus("error");
        setLastError("Sem conexão com o servidor");
        return false;
      }
      if (seq !== connectSeq.current) return false;
      if (!tokenRes.ok) {
        const body = (await tokenRes.json().catch(() => ({}))) as { error?: string };
        if (tokenRes.status === 503) {
          setStatus("unconfigured");
          setLastError("LiveKit não configurado no servidor");
        } else {
          setStatus("error");
          setLastError(body.error ?? `Erro ${tokenRes.status}`);
          cbRef.current.onError(body.error ?? "Não foi possível conectar o áudio/vídeo");
        }
        return false;
      }
      const { token, url } = (await tokenRes.json()) as { token: string; url: string };

      const prefs = prefsRef.current;
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: prefs.audioInputId ?? undefined,
        },
        videoCaptureDefaults: {
          // Reunião usa câmera em 720p (vídeos grandes); proximidade, 360p.
          resolution: (t.kind === "room" ? VideoPresets.h720 : VideoPresets.h360).resolution,
          deviceId: prefs.videoInputId ?? undefined,
        },
        audioOutput: prefs.audioOutputId ? { deviceId: prefs.audioOutputId } : undefined,
      });

      room
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.dataset.identity = participant.identity;
            audioHostRef.current?.appendChild(el);
          }
          rebuild();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
          rebuild();
        })
        .on(RoomEvent.TrackPublished, (_pub, participant) => {
          applyFor(participant);
          rebuild();
        })
        .on(RoomEvent.TrackUnpublished, rebuild)
        .on(RoomEvent.TrackMuted, rebuild)
        .on(RoomEvent.TrackUnmuted, rebuild)
        .on(RoomEvent.LocalTrackPublished, rebuild)
        .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
          if (pub.source === Track.Source.ScreenShare) {
            setScreen(false);
            screenRef.current = false;
          }
          rebuild();
        })
        .on(RoomEvent.ParticipantConnected, (p) => {
          applyFor(p);
          rebuild();
        })
        .on(RoomEvent.ParticipantDisconnected, rebuild)
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          cbRef.current.onSpeakers(new Set(speakers.map((s) => s.identity)));
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
        .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
        .on(RoomEvent.Reconnected, () => setStatus("connected"))
        .on(RoomEvent.MediaDevicesError, (e: Error) => {
          cbRef.current.onError(`Dispositivo de mídia indisponível: ${e.message}`);
        })
        .on(RoomEvent.Disconnected, (reason) => {
          if (roomRef.current !== room) return;
          roomRef.current = null;
          rebuild();
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            setStatus("duplicate");
            return;
          }
          if (reason === DisconnectReason.CLIENT_INITIATED) return;
          // Proximidade sem ninguém por perto: não precisa reconectar.
          if (targetRef.current.kind === "proximity" && !anyoneNearRef.current && !screenRef.current) {
            setStatus("standby");
            return;
          }
          // Queda inesperada: reconecta ao mesmo alvo com espera crescente.
          setStatus("reconnecting");
          const wait = Math.min(15000, 1000 * 2 ** retryRef.current++);
          window.setTimeout(() => {
            if (!roomRef.current) void connectRef.current?.(targetRef.current);
          }, wait);
        });

      try {
        await room.connect(url, token, { autoSubscribe: t.kind === "room" });
      } catch (e) {
        if (seq !== connectSeq.current) return false;
        setStatus("error");
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        cbRef.current.onError("Falha ao conectar no servidor de áudio/vídeo");
        return false;
      }
      if (seq !== connectSeq.current) {
        await room.disconnect();
        return false;
      }
      roomRef.current = room;
      retryRef.current = 0;
      setStatus("connected");
      setAudioBlocked(!room.canPlaybackAudio);

      // Restaura microfone/câmera desejados.
      try {
        if (desiredRef.current.mic) await room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        desiredRef.current.mic = false;
        setMic(false);
        cbRef.current.onError(permissionMessage(e, "microfone"));
      }
      try {
        if (desiredRef.current.cam) {
          await room.localParticipant.setCameraEnabled(true);
          void applyBackground();
        }
      } catch (e) {
        desiredRef.current.cam = false;
        setCam(false);
        cbRef.current.onError(permissionMessage(e, "câmera"));
      }
      applyAll();
      rebuild();
      return true;
    },
    [officeId, disconnect, rebuild, applyFor, applyAll, applyBackground],
  );

  const connect = useCallback(
    async (t: MediaTarget): Promise<boolean> => {
      const seq = ++connectSeq.current;
      targetRef.current = t;
      setTarget(t);
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      connectingRef.current = true;
      try {
        return await connectInner(t, seq);
      } finally {
        if (seq === connectSeq.current) connectingRef.current = false;
      }
    },
    [connectInner],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const statusRef = useRef<MediaStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const lastAttemptRef = useRef(0);

  /**
   * Proximidade: conecta quando alguém está chegando perto (ou há tela compartilhada) e
   * desconecta 20 s depois que todos se afastam. Sozinho, não gasta minutos do LiveKit.
   */
  const syncProximity = useCallback(() => {
    if (targetRef.current.kind !== "proximity") return;
    const want = anyoneNearRef.current || screenRef.current;
    if (want) {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (roomRef.current || connectingRef.current) return;
      const st = statusRef.current;
      if (st === "unconfigured" || st === "duplicate") return;
      // Depois de uma falha, espera um pouco antes de tentar de novo.
      if (st === "error" && Date.now() - lastAttemptRef.current < 15_000) return;
      lastAttemptRef.current = Date.now();
      void connectRef.current?.({ kind: "proximity" });
      return;
    }
    if (!roomRef.current && !connectingRef.current) return;
    if (idleTimerRef.current !== null) return;
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (targetRef.current.kind !== "proximity" || anyoneNearRef.current || screenRef.current) return;
      connectSeq.current++;
      connectingRef.current = false;
      void disconnect().then(() => setStatus("standby"));
    }, 20_000);
  }, [disconnect]);

  // Ao montar: proximidade em espera (conecta quando alguém chegar perto); desconecta ao sair.
  useEffect(() => {
    const seq = connectSeq;
    const timer = window.setTimeout(() => {
      setStatus("standby");
      syncProximity();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      seq.current++;
      void disconnect();
    };
  }, [disconnect, syncProximity]);

  const setMicEnabled = useCallback(
    async (next: boolean) => {
      desiredRef.current.mic = next;
      setMic(next);
      const room = roomRef.current;
      if (!room) return next;
      try {
        await room.localParticipant.setMicrophoneEnabled(next);
      } catch (e) {
        desiredRef.current.mic = false;
        setMic(false);
        cbRef.current.onError(permissionMessage(e, "microfone"));
        return false;
      }
      rebuild();
      return next;
    },
    [rebuild],
  );

  const setDeaf = useCallback(
    (on: boolean) => {
      deafRef.current = on;
      setDeafenedState(on);
      setSoundsDeafened(on);
      applyAll();
    },
    [applyAll],
  );

  const toggleMic = useCallback(async () => {
    const next = !desiredRef.current.mic;
    // Ligar o microfone tira o "silenciar tudo" (como no Discord).
    if (next && deafRef.current) setDeaf(false);
    return setMicEnabled(next);
  }, [setMicEnabled, setDeaf]);

  /** Silenciar tudo: corta o som de todos (e os avisos) e desliga o microfone; ao voltar, restaura o microfone. */
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
    const room = roomRef.current;
    if (!room) return next;
    try {
      await room.localParticipant.setCameraEnabled(next);
      if (next) await applyBackground();
    } catch (e) {
      desiredRef.current.cam = false;
      setCam(false);
      cbRef.current.onError(permissionMessage(e, "câmera"));
      return false;
    }
    rebuild();
    return next;
  }, [rebuild, applyBackground]);

  const toggleScreen = useCallback(async () => {
    // Em espera (ninguém por perto): conecta para poder compartilhar.
    if (!roomRef.current && targetRef.current.kind === "proximity" && statusRef.current !== "unconfigured") {
      screenRef.current = true;
      if (!(await connectRef.current?.({ kind: "proximity" }))) {
        screenRef.current = false;
        return false;
      }
    }
    const room = roomRef.current;
    if (!room) {
      cbRef.current.onError("Conecte-se ao áudio/vídeo para compartilhar a tela");
      return false;
    }
    const next = !room.localParticipant.isScreenShareEnabled;
    try {
      // Tela em 1080p até 30 quadros/s. Com internet ou processador apertados, o navegador
      // reduz um pouco a resolução em vez de congelar a imagem ("balanced").
      // H.264 usa o codificador de vídeo da placa (pouco processador); a camada de 720p/15
      // serve quem está com a tela pequena ou com a conexão fraca.
      await room.localParticipant.setScreenShareEnabled(
        next,
        { audio: false, resolution: ScreenSharePresets.h1080fps30.resolution },
        {
          videoCodec: "h264",
          screenShareEncoding: { maxBitrate: 4_500_000, maxFramerate: 30, priority: "high" },
          screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
          degradationPreference: "balanced",
        },
      );
      setScreen(next);
      screenRef.current = next;
      if (!next) syncProximity();
    } catch (e) {
      setScreen(false);
      screenRef.current = false;
      syncProximity();
      const name = e instanceof Error ? e.name : "";
      if (name !== "NotAllowedError") cbRef.current.onError("Não foi possível compartilhar a tela");
      return false;
    }
    rebuild();
    return next;
  }, [rebuild, syncProximity]);

  /** Recebe o resultado do cálculo de proximidade (modo proximity). */
  const setProximity = useCallback(
    (results: ProximityResult[]) => {
      const m = new Map<string, ProximityResult>();
      for (const r of results) m.set(r.id, r);
      proximityRef.current = m;
      anyoneNearRef.current = results.some((r) => r.approaching);
      applyAll();
      syncProximity();
    },
    [applyAll, syncProximity],
  );

  const switchDevice = useCallback(async (kind: MediaDeviceKind, deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.switchActiveDevice(kind, deviceId);
    } catch {
      cbRef.current.onError("Não foi possível trocar o dispositivo");
    }
  }, []);

  const startAudio = useCallback(async () => {
    await roomRef.current?.startAudio().catch(() => {});
    setAudioBlocked(!(roomRef.current?.canPlaybackAudio ?? true));
  }, []);

  const joinMeeting = useCallback(
    (roomId: string, ticket?: string) => connect({ kind: "room", roomId, ticket }),
    [connect],
  );

  // Registro de uso (minutos conectados ao LiveKit) para o painel de custos.
  useEffect(() => {
    if (status !== "connected") return;
    const kind = target.kind === "room" ? "meeting" : "proximity";
    const t = window.setInterval(() => {
      void fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, kind }),
      }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(t);
  }, [status, target.kind, officeId]);
  /** Sai da reunião e volta para a proximidade (em espera até alguém chegar perto). */
  const leaveMeeting = useCallback(async () => {
    connectSeq.current++;
    connectingRef.current = false;
    targetRef.current = { kind: "proximity" };
    setTarget({ kind: "proximity" });
    await disconnect();
    setStatus("standby");
    syncProximity();
    return true;
  }, [disconnect, syncProximity]);
  const retry = useCallback(() => {
    if (targetRef.current.kind === "proximity" && !anyoneNearRef.current && !screenRef.current) {
      setStatus("standby");
      return Promise.resolve(true);
    }
    return connect(targetRef.current);
  }, [connect]);

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
    applyVolumes: applyAll,
    switchDevice,
    startAudio,
    joinMeeting,
    leaveMeeting,
    retry,
  };
}

function permissionMessage(e: unknown, what: string): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return `Permissão de ${what} negada no navegador.`;
  if (name === "NotFoundError") return `Nenhum(a) ${what} encontrado(a).`;
  if (name === "NotReadableError") return `O(a) ${what} está em uso por outro aplicativo.`;
  return `Não foi possível ativar o(a) ${what}.`;
}
