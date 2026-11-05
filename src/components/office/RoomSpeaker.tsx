"use client";

import {
  ChevronDown,
  ListPlus,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipForward,
  Speaker,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MusicEvent, musicPositionMs } from "@/lib/music";

/** Ao entrar numa sala a música sempre começa no volume mínimo. */
const START_VOLUME = 1;

export interface MusicSnapshot extends MusicEvent {
  /** Diferença relógio do servidor − relógio local (ms) quando o evento chegou. */
  skew: number;
}

interface Props {
  officeId: string;
  roomId: string;
  roomName: string;
  music: MusicSnapshot | null;
  onError: (msg: string) => void;
}

/** Caixa de som da sala: cola um link e toca em sincronia para todos da reunião. */
export function RoomSpeaker({ officeId, roomId, roomName, music, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [volume, setVolume] = useState(START_VOLUME);
  const hostRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLIFrameElement | HTMLAudioElement | null>(null);
  const volumeRef = useRef(volume);

  const state = music?.state ?? null;
  const playing = Boolean(state && !state.paused);
  const playKey = state && !state.paused ? `${state.url}|${state.startedAt}|${state.offsetMs}` : null;

  // Cria o player (fora do render: depende do relógio para calcular a posição).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    mediaRef.current = null;
    if (!playKey || !music?.state) return;
    const s = music.state;
    const pos = musicPositionMs(s, Date.now() + music.skew);
    // Quando a música acaba, avisa o servidor (ele avança a fila uma única vez).
    let reported = false;
    const reportEnded = () => {
      if (reported) return;
      reported = true;
      void fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, roomId, action: "ended", startedAt: s.startedAt }),
      }).catch(() => {});
    };
    let onMessage: ((e: MessageEvent) => void) | null = null;
    if (s.kind === "youtube" && s.videoId) {
      const iframe = document.createElement("iframe");
      const params = new URLSearchParams({
        autoplay: "1",
        // Começa mudo e só desmuta depois de ajustar o volume (evita estouro de som).
        mute: "1",
        start: String(Math.floor(pos / 1000)),
        enablejsapi: "1",
        playsinline: "1",
        controls: "0",
        rel: "0",
        origin: window.location.origin,
      });
      iframe.src = `https://www.youtube-nocookie.com/embed/${s.videoId}?${params}`;
      iframe.allow = "autoplay; encrypted-media";
      iframe.title = "Música da sala";
      iframe.className = "h-full w-full";
      iframe.addEventListener("load", () => {
        const cmd = (func: string, args: unknown[] = []) =>
          iframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
        const send = () => {
          cmd("setVolume", [volumeRef.current]);
          cmd("unMute");
        };
        send();
        window.setTimeout(send, 800);
        window.setTimeout(send, 2500);
        // Pede ao player para avisar mudanças de estado (0 = terminou).
        iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "fredy", channel: "widget" }), "*");
      });
      onMessage = (e: MessageEvent) => {
        if (e.source !== iframe.contentWindow || typeof e.data !== "string") return;
        try {
          const d = JSON.parse(e.data) as { event?: string; info?: unknown };
          const st =
            d.event === "onStateChange"
              ? d.info
              : d.event === "infoDelivery" && d.info && typeof d.info === "object"
                ? (d.info as { playerState?: unknown }).playerState
                : undefined;
          if (st === 0) reportEnded();
        } catch {
          /* mensagem de outro tipo */
        }
      };
      window.addEventListener("message", onMessage);
      host.appendChild(iframe);
      mediaRef.current = iframe;
    } else {
      const audio = document.createElement("audio");
      audio.src = s.url;
      audio.autoplay = true;
      audio.volume = volumeRef.current / 100;
      audio.addEventListener("loadedmetadata", () => {
        const p = musicPositionMs(s, Date.now() + music.skew) / 1000;
        if (Number.isFinite(audio.duration) && p < audio.duration) audio.currentTime = p;
      });
      audio.addEventListener("error", () => onError("Não consegui tocar esse arquivo de áudio."));
      audio.addEventListener("ended", reportEnded);
      host.appendChild(audio);
      mediaRef.current = audio;
    }
    return () => {
      if (onMessage) window.removeEventListener("message", onMessage);
      host.replaceChildren();
      mediaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recria só quando muda o que está tocando
  }, [playKey]);

  // Volume local (só para você).
  useEffect(() => {
    volumeRef.current = volume;
    const m = mediaRef.current;
    if (m instanceof HTMLAudioElement) m.volume = volume / 100;
    else if (m instanceof HTMLIFrameElement)
      m.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [volume] }), "*");
  }, [volume]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId, roomId, ...body }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        onError(j.error ?? "Não foi possível controlar a caixa de som");
        return false;
      }
      return true;
    } catch {
      onError("Sem conexão com o servidor");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const VolIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="pointer-events-none fixed bottom-[88px] left-3 z-[38] sm:bottom-28">
      <div
        className={`pointer-events-auto overflow-hidden rounded-2xl border bg-[var(--panel)]/95 shadow-2xl backdrop-blur transition-all ${open ? "w-[min(340px,calc(100vw-24px))] border-white/10" : "w-auto border-[var(--line)]"}`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Recolher a caixa de som" : "Abrir a caixa de som"}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/5"
        >
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${playing ? "bg-[var(--amber)] text-white" : "bg-white/10 text-[var(--muted)]"}`}>
            <Speaker size={17} className={playing ? "animate-pulse" : undefined} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Caixa de som</span>
            <span className="block max-w-56 truncate text-xs text-[var(--muted)]">
              {state ? `${state.paused ? "Pausado" : "Tocando"}: ${state.title || state.url}` : "Nada tocando"}
            </span>
          </span>
          {open && <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />}
        </button>

        {/* O player fica sempre montado (recolher não interrompe a música). */}
        <div
          ref={hostRef}
          className={
            open && state?.kind === "youtube" && playing
              ? "mx-3 mb-2 aspect-video overflow-hidden rounded-xl bg-black"
              : "pointer-events-none fixed -left-[9999px] top-0 h-[90px] w-[160px] opacity-0"
          }
          aria-hidden={!open}
        />

        {open && (
          <div className="space-y-3 px-3 pb-3">
            {state && (
              <div className="rounded-xl bg-white/5 p-2.5 text-xs">
                <div className="flex items-center gap-1.5 text-white">
                  <Music2 size={13} className="shrink-0 text-[var(--amber)]" />
                  <a href={state.url} target="_blank" rel="noreferrer noopener" className="truncate hover:underline">
                    {state.title || state.url}
                  </a>
                </div>
                <div className="mt-1 text-[var(--muted)]">
                  {state.paused ? "Pausado" : "Tocando"} por {state.by} · todos da {roomName} ouvem
                </div>
                <div className="mt-2 flex gap-2">
                  {state.paused ? (
                    <button type="button" disabled={busy} onClick={() => void send({ action: "resume" })} className="btn-primary h-8 flex-1 text-xs">
                      <Play size={14} /> Continuar
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void send({ action: "pause" })} className="btn-ghost h-8 flex-1 text-xs">
                      <Pause size={14} /> Pausar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || (!state.queue?.length && state.loop !== "all")}
                    onClick={() => void send({ action: "next" })}
                    className="btn-ghost h-8 flex-1 text-xs"
                    aria-label="Próxima música"
                  >
                    <SkipForward size={14} /> Próxima
                  </button>
                  <button type="button" disabled={busy} onClick={() => void send({ action: "stop" })} className="btn-danger h-8 flex-1 text-xs">
                    <Square size={13} /> Parar
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void send({ action: "loop", mode: state.loop === "one" ? "all" : state.loop === "all" ? "off" : "one" })
                  }
                  aria-label="Mudar o modo de repetição"
                  className={`mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs ${state.loop && state.loop !== "off" ? "bg-[var(--amber)] text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"}`}
                >
                  {state.loop === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
                  {state.loop === "one" ? "Repetindo esta música" : state.loop === "all" ? "Repetindo a fila" : "Repetir: desligado"}
                </button>
                {state.queue && state.queue.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[var(--muted)]">Próximas ({state.queue.length})</div>
                    <ol className="scroll-thin max-h-32 space-y-1 overflow-y-auto">
                      {state.queue.map((q, i) => (
                        <li key={`${q.url}-${i}`} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1">
                          <span className="w-4 shrink-0 text-[var(--muted)]">{i + 1}.</span>
                          <span className="min-w-0 flex-1 truncate text-white" title={`${q.title || q.url} · por ${q.by}`}>
                            {q.title || q.url}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void send({ action: "remove", index: i })}
                            className="grid h-5 w-5 shrink-0 place-items-center rounded text-[var(--muted)] hover:bg-white/10 hover:text-white"
                            aria-label={`Tirar da fila: ${q.title || q.url}`}
                          >
                            <X size={12} />
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!url.trim()) return;
                if (await send({ action: "play", url })) setUrl("");
              }}
              className="flex gap-2"
            >
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole o link do YouTube"
                aria-label="Link da música"
                className="input h-9 flex-1 text-sm"
                inputMode="url"
              />
              <button type="submit" disabled={busy || !url.trim()} className="btn-primary h-9 px-3 text-sm" aria-label="Tocar agora">
                <Play size={14} /> Tocar
              </button>
              {state && (
                <button
                  type="button"
                  disabled={busy || !url.trim()}
                  onClick={async () => {
                    if (await send({ action: "add", url })) setUrl("");
                  }}
                  className="btn-ghost h-9 px-2.5 text-sm"
                  aria-label="Adicionar à fila"
                  title="Adicionar à fila"
                >
                  <ListPlus size={15} />
                </button>
              )}
            </form>

            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <VolIcon size={15} className="shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 accent-[var(--amber)]"
                aria-label="Volume da música (só para você)"
              />
              <span className="w-24 shrink-0 text-right">{volume}% · só para você</span>
            </label>
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              Dica: com fone de ouvido a música não volta pelo seu microfone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
