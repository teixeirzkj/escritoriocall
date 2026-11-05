"use client";

import {
  ArrowLeftRight,
  DoorClosed,
  DoorOpen,
  Expand,
  GripVertical,
  Lock,
  Map as MapIcon,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Pin,
  PictureInPicture2,
  PinOff,
  Shrink,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AvatarThumb } from "@/components/AvatarThumb";
import type { AvatarConfig } from "@/lib/avatar";
import type { MediaParticipant, VideoTile } from "@/lib/media/useMedia";
import type { RoomInfo } from "@/lib/types";
import { TrackVideo } from "./VideoTiles";

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const isNarrowNow = () => window.innerWidth < 640;

/** Janela minimizada da reunião: tamanhos e posição salva neste navegador. */
const MINI_WIDTHS = { p: 300, m: 420, g: 560 } as const;
type MiniSize = keyof typeof MINI_WIDTHS;
const MINI_KEY = "fredy:janela-reuniao";
function loadMini(): { pos: { x: number; y: number } | null; size: MiniSize } {
  try {
    const v = JSON.parse(window.localStorage.getItem(MINI_KEY) ?? "null") as { pos?: unknown; size?: unknown } | null;
    const size: MiniSize = v?.size === "p" || v?.size === "g" ? v.size : "m";
    const p = v?.pos as { x?: unknown; y?: unknown } | undefined;
    const pos = p && typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : null;
    return { pos, size };
  } catch {
    return { pos: null, size: "m" };
  }
}

/** Colunas da grade conforme o número de pessoas (estilo Meet). */
function gridCols(n: number, narrow: boolean) {
  if (narrow) return n <= 2 ? 1 : 2;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

interface Props {
  room: RoomInfo;
  rooms: RoomInfo[];
  occupancy: Map<string, number>;
  participants: MediaParticipant[];
  tiles: VideoTile[];
  speakers: Set<string>;
  switching: boolean;
  /** Minimizada: a chamada continua num painel flutuante e o mapa fica visível. */
  minimized: boolean;
  avatarFor: (id: string) => AvatarConfig;
  onSwitch: (room: RoomInfo) => void;
  onMinimize: () => void;
  onExpand: () => void;
  /** Janela flutuante (fora da aba) aberta. */
  pipOpen: boolean;
  onPip: () => void;
  /** Reação recente de cada pessoa (some sozinha) e mãos levantadas. */
  reactions: Map<string, { emoji: string; key: number }>;
  hands: Set<string>;
  /** Sala trancada (só entra quem alguém de dentro deixar). */
  locked: boolean;
  lockBusy: boolean;
  onToggleLock: () => void;
}

/** Tela da reunião: ocupa a tela toda, câmeras grandes e tela compartilhada em destaque. */
export function MeetingRoom({
  room,
  rooms,
  occupancy,
  participants,
  tiles,
  speakers,
  switching,
  minimized,
  avatarFor,
  onSwitch,
  onMinimize,
  onExpand,
  pipOpen,
  onPip,
  reactions,
  hands,
  locked,
  lockBusy,
  onToggleLock,
}: Props) {
  const narrow = useSyncExternalStore(subscribeResize, isNarrowNow, () => false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  /** Transmissão ampliada: a tela ocupa tudo e os rostos ficam pequenos no canto. */
  const [theater, setTheater] = useState(false);
  const [osFullscreen, setOsFullscreen] = useState(false);
  const theaterRef = useRef<HTMLDivElement>(null);

  // Janela minimizada arrastável.
  const [miniPos, setMiniPos] = useState<{ x: number; y: number } | null>(() =>
    typeof window === "undefined" ? null : loadMini().pos,
  );
  const [miniSize, setMiniSize] = useState<MiniSize>(() => (typeof window === "undefined" ? "m" : loadMini().size));
  const miniRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const clampPos = (x: number, y: number) => {
    const el = miniRef.current;
    const w = el?.offsetWidth ?? 300;
    const h = el?.offsetHeight ?? 200;
    return {
      x: Math.round(Math.min(Math.max(8, x), window.innerWidth - w - 8)),
      y: Math.round(Math.min(Math.max(8, y), window.innerHeight - h - 8)),
    };
  };
  const onDragStart = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("[data-nodrag]") || !miniRef.current) return;
    const r = miniRef.current.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (d) setMiniPos(clampPos(e.clientX - d.dx, e.clientY - d.dy));
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(MINI_KEY, JSON.stringify({ pos: miniPos, size: miniSize }));
    } catch {
      /* ignora */
    }
  }, [miniPos, miniSize]);

  useEffect(() => {
    const onResize = () =>
      setMiniPos((p) => {
        if (!p) return p;
        const el = miniRef.current;
        const w = el?.offsetWidth ?? 300;
        const h = el?.offsetHeight ?? 200;
        return {
          x: Math.min(Math.max(8, p.x), window.innerWidth - w - 8),
          y: Math.min(Math.max(8, p.y), window.innerHeight - h - 8),
        };
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onFs = () => setOsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleOsFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const screens = tiles.filter((t) => t.source === "screen");
  const camOf = (id: string) => tiles.find((t) => t.identity === id && t.source === "camera");

  // Destaque: o que foi fixado; senão a primeira tela compartilhada.
  const focus = useMemo(() => {
    if (pinned) {
      const scr = screens.find((s) => s.key === pinned);
      if (scr) return { kind: "screen" as const, tile: scr };
      const p = participants.find((x) => x.identity === pinned);
      if (p) return { kind: "person" as const, p };
    }
    if (screens[0]) return { kind: "screen" as const, tile: screens[0] };
    return null;
  }, [pinned, screens, participants]);

  const togglePin = (key: string) => setPinned((cur) => (cur === key ? null : key));

  const others = rooms.filter((r) => r.id !== room.id);
  const count = participants.length;
  const cols = gridCols(count, narrow);
  const rows = Math.max(1, Math.ceil(count / cols));

  const personTile = (p: MediaParticipant, opts: { big?: boolean; small?: boolean } = {}) => {
    const cam = camOf(p.identity);
    const speaking = speakers.has(p.identity);
    const isPinned = pinned === p.identity;
    return (
      <figure
        key={p.identity}
        className={`group relative h-full w-full overflow-hidden rounded-2xl border-2 bg-[var(--panel-2)] transition ${speaking ? "border-[var(--amber)] shadow-[0_0_0_3px_rgba(43,106,243,0.35)]" : "border-transparent"}`}
      >
        {cam ? (
          <TrackVideo tile={cam} className={`h-full w-full ${opts.big ? "object-contain bg-black" : "object-cover"}`} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#1f2b5c,#0e1533)]">
            <div className="flex flex-col items-center gap-2">
              <AvatarThumb avatar={avatarFor(p.identity)} scale={opts.small ? 2 : opts.big ? 5 : 3} />
            </div>
          </div>
        )}
        <figcaption className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-xs text-white">
          {p.mic ? <Mic size={13} className="text-emerald-300" /> : <MicOff size={13} className="text-[#ff9b92]" />}
          <span className="truncate">{p.isLocal ? "Você" : p.name}</span>
        </figcaption>
        {hands.has(p.identity) && (
          <span className="absolute left-2 top-2 rounded-lg bg-[var(--amber)] px-1.5 py-0.5 text-sm shadow-lg" aria-label="Mão levantada">
            ✋
          </span>
        )}
        {reactions.get(p.identity) && (
          <span
            key={reactions.get(p.identity)!.key}
            className="react-pop pointer-events-none absolute inset-0 grid place-items-center text-5xl"
            aria-hidden
          >
            {reactions.get(p.identity)!.emoji}
          </span>
        )}
        <button
          type="button"
          onClick={() => togglePin(p.identity)}
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={isPinned ? `Desafixar ${p.isLocal ? "você" : p.name}` : `Fixar ${p.isLocal ? "você" : p.name} em destaque`}
          title={isPinned ? "Desafixar" : "Fixar em destaque"}
        >
          {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      </figure>
    );
  };

  if (minimized) {
    const mainScreen = focus?.kind === "screen" ? focus.tile : null;
    const width = MINI_WIDTHS[miniSize];
    const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
    return (
      <section
        ref={miniRef}
        className="panel-in fixed z-[35] flex max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]/95 shadow-2xl backdrop-blur"
        style={
          miniPos
            ? { left: miniPos.x, top: miniPos.y, width: `min(${width}px, calc(100vw - 24px))` }
            : { right: 12, bottom: 112, width: `min(${width}px, calc(100vw - 24px))` }
        }
        aria-label={`Reunião minimizada: ${room.name}`}
      >
        <header
          className="flex cursor-grab touch-none select-none items-center justify-between gap-2 px-3 py-2 active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          title="Arraste para mover"
        >
          <div className="flex min-w-0 items-center gap-2 text-sm text-white">
            <GripVertical size={14} className="shrink-0 text-[var(--muted)]" aria-hidden />
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--coral)]" />
            <span className="truncate font-semibold">{room.name}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--muted)]">
              <Users size={12} /> {count}/{room.capacity}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5" data-nodrag>
            <button
              type="button"
              onClick={onPip}
              aria-pressed={pipOpen}
              className={`grid h-8 w-8 place-items-center rounded-lg text-white ${pipOpen ? "bg-[var(--amber)]" : "bg-white/5 hover:bg-white/10"}`}
              aria-label={pipOpen ? "Fechar a janela flutuante" : "Abrir janela flutuante (fica visível em outras abas)"}
              title={pipOpen ? "Fechar a janela flutuante" : "Janela flutuante: continua visível em outras abas"}
            >
              <PictureInPicture2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setMiniSize((s) => (s === "p" ? "m" : s === "m" ? "g" : "p"))}
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-xs font-semibold text-white hover:bg-white/10"
              aria-label={`Tamanho da janela: ${miniSize === "p" ? "pequena" : miniSize === "m" ? "média" : "grande"} (clique para mudar)`}
              title="Mudar o tamanho"
            >
              {miniSize.toUpperCase()}
            </button>
            <button type="button" onClick={onExpand} className="btn-primary h-8 px-2.5 text-xs" aria-label="Voltar para a reunião em tela cheia">
              <Maximize2 size={14} /> Tela cheia
            </button>
          </div>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {mainScreen && (
            <button
              type="button"
              onClick={onExpand}
              className="relative mb-2 block aspect-video w-full overflow-hidden rounded-xl bg-black"
              aria-label={`Abrir em tela cheia a tela de ${mainScreen.isLocal ? "você" : mainScreen.name}`}
            >
              <TrackVideo tile={mainScreen} className="h-full w-full object-contain" />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                <MonitorUp size={11} className="mr-1 inline" /> Tela de {mainScreen.isLocal ? "você" : mainScreen.name}
              </span>
            </button>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {participants.map((p) => (
              <div key={p.identity} className="aspect-video">
                {personTile(p, { small: true })}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="fixed inset-0 z-[35] flex flex-col bg-[var(--bg)] pb-20 sm:pb-24"
      aria-label={`Reunião: ${room.name}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5 text-white">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--coral)]" />
          <h1 className="truncate text-base font-semibold sm:text-lg">{room.name}</h1>
          <span className="flex shrink-0 items-center gap-1 text-sm text-[var(--muted)]">
            <Users size={14} /> {count}/{room.capacity}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleLock}
          disabled={lockBusy}
          aria-pressed={locked}
          className={`h-9 px-3 text-sm ${locked ? "btn-primary" : "btn-ghost"}`}
          aria-label={locked ? "Destrancar a sala" : "Trancar a sala (quem chegar precisa bater na porta)"}
          title={locked ? "Sala trancada: clique para destrancar" : "Trancar: quem chegar precisa bater na porta"}
        >
          {locked ? <DoorClosed size={15} /> : <DoorOpen size={15} />}
          <span className="hidden lg:inline">{locked ? "Trancada" : "Trancar"}</span>
        </button>
        <button
          type="button"
          onClick={onPip}
          aria-pressed={pipOpen}
          className={`h-9 px-3 text-sm ${pipOpen ? "btn-primary" : "btn-ghost"}`}
          aria-label={pipOpen ? "Fechar a janela flutuante" : "Abrir janela flutuante (fica visível em outras abas)"}
          title="Janela flutuante: continua visível em outras abas e programas"
        >
          <PictureInPicture2 size={15} /> <span className="hidden md:inline">{pipOpen ? "Fechar flutuante" : "Janela flutuante"}</span>
        </button>
        <button type="button" onClick={onMinimize} className="btn-ghost h-9 px-3 text-sm" aria-label="Ver o mapa (a chamada continua)">
          <MapIcon size={15} /> <span className="hidden sm:inline">Ver mapa</span>
        </button>
        {others.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              disabled={switching}
              aria-expanded={menu}
              className="btn-ghost h-9 px-3 text-sm"
            >
              <ArrowLeftRight size={15} /> {switching ? "Trocando…" : "Trocar de sala"}
            </button>
            {menu && (
              <ul className="panel-in absolute right-0 top-11 z-10 w-72 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 shadow-2xl">
                {others.map((r) => {
                  const occ = occupancy.get(r.id) ?? 0;
                  const full = occ >= r.capacity;
                  const blocked = !r.canAccess;
                  const isLocked = Boolean(r.lockedBy);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={full || blocked}
                        onClick={() => {
                          setMenu(false);
                          onSwitch(r);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {(blocked || isLocked) && <Lock size={13} className="shrink-0 text-[var(--muted)]" />}
                          <span className="truncate">{r.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {blocked ? "restrita" : full ? "cheia" : isLocked ? "trancada · bater" : `${occ}/${r.capacity}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        </div>
      </header>

      <div className="min-h-0 flex-1 px-3 pb-3">
        {focus && theater && focus.kind === "screen" ? (
          <div ref={theaterRef} className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
            <TrackVideo tile={focus.tile} className="h-full w-full object-contain" />
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-sm text-white">
              <MonitorUp size={15} /> Tela de {focus.tile.isLocal ? "você" : focus.tile.name}
            </div>
            <div className="absolute right-3 top-3 flex gap-2">
              <button
                type="button"
                onClick={toggleOsFullscreen}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-black/60 px-3 text-sm text-white hover:bg-black/80"
                aria-label={osFullscreen ? "Sair da tela cheia do monitor" : "Tela cheia do monitor"}
              >
                {osFullscreen ? <Shrink size={15} /> : <Expand size={15} />}
                <span className="hidden sm:inline">{osFullscreen ? "Sair da tela cheia" : "Tela cheia do monitor"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
                  setTheater(false);
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-black/60 px-3 text-sm text-white hover:bg-black/80"
                aria-label="Reduzir a transmissão"
              >
                <Minimize2 size={15} /> <span className="hidden sm:inline">Reduzir</span>
              </button>
            </div>
            <div className="absolute bottom-3 right-3 flex max-h-[70%] w-28 flex-col gap-2 overflow-y-auto sm:w-40">
              {participants.map((p) => (
                <div key={p.identity} className="aspect-video w-full shrink-0 opacity-95">
                  {personTile(p, { small: true })}
                </div>
              ))}
            </div>
          </div>
        ) : focus ? (
          <div className="flex h-full flex-col gap-3 lg:flex-row">
            <div className="group relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
              {focus.kind === "screen" ? (
                <>
                  <TrackVideo tile={focus.tile} className="h-full w-full object-contain" />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-sm text-white">
                    <MonitorUp size={15} /> Tela de {focus.tile.isLocal ? "você" : focus.tile.name}
                  </div>
                  <div className="absolute right-3 top-3 flex gap-2">
                    {pinned === focus.tile.key && (
                      <button
                        type="button"
                        onClick={() => setPinned(null)}
                        className="grid h-9 w-9 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80"
                        aria-label="Desafixar tela"
                        title="Desafixar"
                      >
                        <PinOff size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTheater(true)}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--amber)] px-3 text-sm font-semibold text-white shadow-lg hover:brightness-110"
                      aria-label="Ampliar a transmissão"
                    >
                      <Maximize2 size={15} /> Ampliar
                    </button>
                  </div>
                </>
              ) : (
                personTile(focus.p, { big: true })
              )}
            </div>
            <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-72 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
              {screens
                .filter((s) => focus.kind !== "screen" || s.key !== focus.tile.key)
                .map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => togglePin(s.key)}
                    className="relative aspect-video h-28 shrink-0 overflow-hidden rounded-xl bg-black lg:h-auto lg:w-full"
                    aria-label={`Destacar a tela de ${s.isLocal ? "você" : s.name}`}
                  >
                    <TrackVideo tile={s} className="h-full w-full object-contain" />
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      <MonitorUp size={11} className="mr-1 inline" />
                      {s.isLocal ? "Você" : s.name}
                    </span>
                  </button>
                ))}
              {participants
                .filter((p) => focus.kind !== "person" || p.identity !== focus.p.identity)
                .map((p) => (
                  <div key={p.identity} className="aspect-video h-28 shrink-0 lg:h-auto lg:w-full">
                    {personTile(p, { small: true })}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div
            className="mx-auto grid h-full max-w-[1600px] gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {participants.map((p) => personTile(p))}
          </div>
        )}
      </div>
    </section>
  );
}
