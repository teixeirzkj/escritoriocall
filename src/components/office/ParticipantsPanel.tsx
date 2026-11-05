"use client";

import { BellRing, MessageSquare, Mic, MicOff, MonitorUp, Navigation, Video, VideoOff, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AvatarThumb } from "@/components/AvatarThumb";
import type { AvatarConfig } from "@/lib/avatar";

export interface ParticipantRow {
  id: string;
  name: string;
  avatar: AvatarConfig;
  isMe: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  near: boolean;
  label: string;
  inMeeting: boolean;
  /** Status (emoji + texto) e mão levantada. */
  statusEmoji: string;
  statusLabel: string;
  hand: boolean;
}

interface Props {
  rows: ParticipantRow[];
  onClose: () => void;
  onMessage: (id: string) => void;
  onGoTo: (id: string) => void;
  onRing: (id: string) => void;
}

export function ParticipantsPanel({ rows, onClose, onMessage, onGoTo, onRing }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => r.name.toLowerCase().includes(s) || r.label.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  return (
    <aside
      className="panel-in absolute bottom-24 right-3 top-20 z-40 flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#131c42]/95 shadow-2xl backdrop-blur sm:right-4"
      aria-label="Participantes"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Participantes</h2>
          <p className="text-xs text-[var(--muted)]">{rows.length} online agora</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white" aria-label="Fechar">
          <X size={16} />
        </button>
      </header>
      <div className="px-3 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar pessoa ou sala…"
          className="input h-9 text-sm"
          aria-label="Buscar participante"
        />
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.map((r) => (
          <li
            key={r.id}
            className={`group flex items-center gap-3 rounded-xl px-2 py-2 ${r.speaking ? "bg-emerald-400/10" : "hover:bg-white/5"}`}
          >
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1d2a5c] ring-2 ${r.speaking ? "ring-emerald-400" : r.near ? "ring-[var(--amber)]/70" : "ring-transparent"}`}
            >
              <AvatarThumb avatar={r.avatar} scale={1} bust />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-white">{r.name}</span>
                <span className="shrink-0 text-xs" title={r.statusLabel} aria-label={`Status: ${r.statusLabel}`}>{r.statusEmoji}</span>
                {r.hand && <span className="shrink-0 text-xs" title="Mão levantada" aria-label="Mão levantada">✋</span>}
                {r.isMe && <span className="rounded bg-white/10 px-1.5 text-[10px] text-[var(--muted)]">você</span>}
                {r.near && <span className="rounded bg-[var(--amber)]/15 px-1.5 text-[10px] text-[var(--amber)]">perto</span>}
              </div>
              <div className={`truncate text-xs ${r.inMeeting ? "text-[#9fb6ff]" : "text-[var(--muted)]"}`}>{r.label}</div>
            </div>
            <div className="flex items-center gap-1 text-[var(--muted)]">
              {r.screen && <MonitorUp size={15} className="text-[var(--amber)]" aria-label="Compartilhando tela" />}
              {r.cam ? <Video size={15} className="text-emerald-300" aria-label="Câmera ligada" /> : <VideoOff size={15} aria-label="Câmera desligada" />}
              {r.mic ? <Mic size={15} className="text-emerald-300" aria-label="Microfone ligado" /> : <MicOff size={15} className="text-[#ff9b92]" aria-label="Microfone desligado" />}
            </div>
            {!r.isMe && (
              <div className="flex gap-1 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button type="button" onClick={() => onRing(r.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" title={`Chamar ${r.name}`} aria-label={`Chamar ${r.name}`}>
                  <BellRing size={15} />
                </button>
                <button type="button" onClick={() => onMessage(r.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" title={`Mensagem para ${r.name}`} aria-label={`Mensagem para ${r.name}`}>
                  <MessageSquare size={15} />
                </button>
                <button type="button" onClick={() => onGoTo(r.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" title={`Ir até ${r.name}`} aria-label={`Ir até ${r.name}`}>
                  <Navigation size={15} />
                </button>
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--muted)]">Ninguém encontrado.</li>}
      </ul>
    </aside>
  );
}
