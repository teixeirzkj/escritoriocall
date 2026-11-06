/**
 * Caixa de som das salas: música tocando em sincronia para todos da reunião.
 * Cada navegador toca o áudio localmente; o servidor guarda só o estado (link + tempo).
 */

/** Uma música (atual ou na fila). */
/** Áreas do mapa (fora das salas) que têm caixa de som: só quem está na área ouve. */
export const MUSIC_ZONES = ["corredor", "lazer"] as const;
export type MusicZone = (typeof MUSIC_ZONES)[number];
export const isMusicZone = (z: string | null | undefined): z is MusicZone => (MUSIC_ZONES as readonly string[]).includes(z ?? "");

export interface MusicItem {
  url: string;
  kind: "youtube" | "audio";
  /** id do vídeo, quando YouTube. */
  videoId: string | null;
  title: string | null;
  by: string;
}

export type LoopMode = "off" | "one" | "all";

export interface MusicState extends MusicItem {
  /** Quando começou a tocar a partir de `offsetMs` (relógio do servidor, ms). */
  startedAt: number;
  /** Posição (ms) no momento `startedAt`, ou posição em que pausou. */
  offsetMs: number;
  paused: boolean;
  /** Próximas músicas. */
  queue?: MusicItem[];
  /** Repetir: desligado, a música atual ou a fila toda. */
  loop?: LoopMode;
}

/** Evento publicado no canal da sala (o horário do servidor corrige o relógio local). */
export interface MusicEvent {
  state: MusicState | null;
  serverNow: number;
}

export type ParsedMusicUrl =
  | { ok: true; kind: "youtube"; videoId: string; url: string }
  | { ok: true; kind: "audio"; url: string }
  | { ok: false; error: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|opus|flac|webm)$/i;

export function parseMusicUrl(raw: string): ParsedMusicUrl {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Link inválido. Cole o endereço completo (https://…)." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Use um link https://." };
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  if (host === "open.spotify.com" || host.endsWith("spotify.com")) {
    return { ok: false, error: "O Spotify não permite tocar fora do app dele. Use um link do YouTube." };
  }
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  if (id !== null) {
    if (!YT_ID.test(id)) return { ok: false, error: "Não reconheci o vídeo desse link do YouTube." };
    return { ok: true, kind: "youtube", videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (AUDIO_EXT.test(u.pathname)) return { ok: true, kind: "audio", url: u.toString() };
  return { ok: false, error: "Cole um link do YouTube ou de um arquivo de áudio (.mp3, .ogg…)." };
}

/** Posição atual da música em ms, dado o relógio do servidor. */
export function musicPositionMs(s: MusicState, serverNow: number): number {
  if (s.paused) return s.offsetMs;
  return Math.max(0, s.offsetMs + (serverNow - s.startedAt));
}
