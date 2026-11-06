"use client";

import {
  DoorOpen,
  Headphones,
  HeadphoneOff,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Settings,
  Sparkles,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MediaStatus } from "@/lib/media/useMedia";
import { ReactionsButton } from "./ReactionsButton";

interface Props {
  mic: boolean;
  cam: boolean;
  screen: boolean;
  mediaReady: boolean;
  mediaStatus: MediaStatus;
  inMeeting: boolean;
  panel: "none" | "participants" | "chat";
  unread: number;
  participantsCount: number;
  onMic: () => void;
  /** Silenciar tudo (não ouvir ninguém nem os avisos; microfone desligado). */
  deafened: boolean;
  onDeafen: () => void;
  onCam: () => void;
  onScreen: () => void;
  onSettings: () => void;
  onBackground: () => void;
  /** Algum efeito de fundo ativo. */
  backgroundOn: boolean;
  hand: boolean;
  onReact: (e: string) => void;
  onHand: () => void;
  onPunch: () => void;
  onParticipants: () => void;
  onChat: () => void;
  onLeave: () => void;
}

function Btn({
  label,
  active,
  danger,
  off,
  disabled,
  onClick,
  children,
  badge,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  off?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: number | string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        "group relative grid h-11 w-11 place-items-center rounded-xl transition sm:h-12 sm:w-12",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "bg-[var(--coral)] text-white hover:brightness-110"
          : off
            ? "bg-[#3a2228] text-[#ff9b92] hover:bg-[#46282f]"
            : active
              ? "bg-[var(--amber)] text-white hover:brightness-105"
              : "bg-white/5 text-[var(--text)] hover:bg-white/10",
      ].join(" ")}
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--coral)] px-1 text-center text-[10px] font-bold leading-5 text-white">
          {badge}
        </span>
      ) : null}
      <span className="pointer-events-none absolute -top-9 hidden whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs text-white group-hover:block">
        {label}
      </span>
    </button>
  );
}

const noop = () => () => {};
/** Compartilhar tela existe neste navegador? (no celular, em geral não). */
const canShareScreen = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

/** Barra de controles discreta na parte inferior. */
export function ControlBar(p: Props) {
  const mediaDisabled = p.mediaStatus === "unconfigured";
  const screenOk = useSyncExternalStore(noop, canShareScreen, () => true);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMore(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [more]);
  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-white hover:bg-white/10 disabled:opacity-40";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[38] flex justify-center px-3 sm:bottom-5">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#131c42]/90 p-1.5 shadow-2xl shadow-black/40 backdrop-blur sm:gap-2 sm:p-2">
        <Btn
          label={p.mic ? "Desligar microfone" : "Ligar microfone"}
          active={p.mic}
          off={!p.mic}
          disabled={mediaDisabled}
          onClick={p.onMic}
        >
          {p.mic ? <Mic size={20} /> : <MicOff size={20} />}
        </Btn>
        <div className="hidden sm:contents">
          <Btn
            label={p.deafened ? "Voltar a ouvir" : "Silenciar tudo (não ouvir ninguém)"}
            off={p.deafened}
            onClick={p.onDeafen}
          >
            {p.deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
          </Btn>
        </div>
        <Btn
          label={p.cam ? "Desligar câmera" : "Ligar câmera"}
          active={p.cam}
          off={!p.cam}
          disabled={mediaDisabled}
          onClick={p.onCam}
        >
          {p.cam ? <Video size={20} /> : <VideoOff size={20} />}
        </Btn>
        <div className="hidden sm:contents">
          <Btn label="Efeitos de fundo" active={p.backgroundOn} disabled={mediaDisabled} onClick={p.onBackground}>
            <Sparkles size={20} />
          </Btn>
          {screenOk && (
            <Btn
              label={p.screen ? "Parar compartilhamento" : "Compartilhar tela"}
              active={p.screen}
              disabled={!p.mediaReady}
              onClick={p.onScreen}
            >
              <MonitorUp size={20} />
            </Btn>
          )}
        </div>
        <ReactionsButton hand={p.hand} onReact={p.onReact} onHand={p.onHand} onPunch={p.onPunch} />
        <span className="mx-0.5 hidden h-7 w-px bg-white/10 sm:block" aria-hidden />
        <Btn label="Participantes" active={p.panel === "participants"} onClick={p.onParticipants} badge={p.participantsCount}>
          <Users size={20} />
        </Btn>
        <Btn label="Chat" active={p.panel === "chat"} onClick={p.onChat} badge={p.unread || undefined}>
          <MessageSquare size={20} />
        </Btn>
        <div className="hidden sm:contents">
          <Btn label="Configurações" onClick={p.onSettings}>
            <Settings size={20} />
          </Btn>
        </div>
        {/* Celular: o resto fica no menu "Mais". */}
        <div ref={moreRef} className="relative sm:hidden">
          <Btn label="Mais opções" active={more || p.backgroundOn || p.screen} off={p.deafened && !more} onClick={() => setMore((m) => !m)}>
            <MoreHorizontal size={20} />
          </Btn>
          {more && (
            <div className="panel-in fixed inset-x-3 bottom-[76px] z-50 rounded-2xl border border-white/10 bg-[var(--panel)] p-1.5 shadow-2xl" role="menu">
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMore(false);
                  p.onDeafen();
                }}
              >
                {p.deafened ? <Headphones size={18} className="text-[var(--amber)]" /> : <HeadphoneOff size={18} className="text-[var(--amber)]" />}
                {p.deafened ? "Voltar a ouvir" : "Silenciar tudo"}
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                disabled={mediaDisabled}
                onClick={() => {
                  setMore(false);
                  p.onBackground();
                }}
              >
                <Sparkles size={18} className="text-[var(--amber)]" /> Efeitos de fundo{p.backgroundOn ? " (ligado)" : ""}
              </button>
              {screenOk && (
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  disabled={!p.mediaReady}
                  onClick={() => {
                    setMore(false);
                    p.onScreen();
                  }}
                >
                  <MonitorUp size={18} className="text-[var(--amber)]" /> {p.screen ? "Parar compartilhamento" : "Compartilhar tela"}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setMore(false);
                  p.onSettings();
                }}
              >
                <Settings size={18} className="text-[var(--amber)]" /> Configurações
              </button>
            </div>
          )}
        </div>
        <span className="mx-0.5 hidden h-7 w-px bg-white/10 sm:block" aria-hidden />
        <Btn label={p.inMeeting ? "Sair da reunião" : "Sair do escritório"} danger onClick={p.onLeave}>
          {p.inMeeting ? <DoorOpen size={20} /> : <LogOut size={20} />}
        </Btn>
      </div>
    </div>
  );
}
