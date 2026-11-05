"use client";

import {
  DoorOpen,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Settings,
  Sparkles,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import type { ReactNode } from "react";
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

/** Barra de controles discreta na parte inferior. */
export function ControlBar(p: Props) {
  const mediaDisabled = p.mediaStatus === "unconfigured";
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
        <Btn
          label={p.cam ? "Desligar câmera" : "Ligar câmera"}
          active={p.cam}
          off={!p.cam}
          disabled={mediaDisabled}
          onClick={p.onCam}
        >
          {p.cam ? <Video size={20} /> : <VideoOff size={20} />}
        </Btn>
        <Btn label="Efeitos de fundo" active={p.backgroundOn} disabled={mediaDisabled} onClick={p.onBackground}>
          <Sparkles size={20} />
        </Btn>
        <Btn
          label={p.screen ? "Parar compartilhamento" : "Compartilhar tela"}
          active={p.screen}
          disabled={!p.mediaReady}
          onClick={p.onScreen}
        >
          <MonitorUp size={20} />
        </Btn>
        <ReactionsButton hand={p.hand} onReact={p.onReact} onHand={p.onHand} onPunch={p.onPunch} />
        <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden />
        <Btn label="Participantes" active={p.panel === "participants"} onClick={p.onParticipants} badge={p.participantsCount}>
          <Users size={20} />
        </Btn>
        <Btn label="Chat" active={p.panel === "chat"} onClick={p.onChat} badge={p.unread || undefined}>
          <MessageSquare size={20} />
        </Btn>
        <Btn label="Configurações" onClick={p.onSettings}>
          <Settings size={20} />
        </Btn>
        <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden />
        <Btn label={p.inMeeting ? "Sair da reunião" : "Sair do escritório"} danger onClick={p.onLeave}>
          {p.inMeeting ? <DoorOpen size={20} /> : <LogOut size={20} />}
        </Btn>
      </div>
    </div>
  );
}
