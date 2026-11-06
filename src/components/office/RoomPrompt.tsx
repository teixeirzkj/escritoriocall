"use client";

import { DoorOpen, Lock, Users } from "lucide-react";
import type { RoomInfo } from "@/lib/types";

interface Props {
  room: RoomInfo;
  occupancy: number;
  joining: boolean;
  mediaUnavailable: boolean;
  onJoin: () => void;
  /** Reserva da sala (agora ou em breve). */
  note?: string | null;
}

/** Cartão exibido ao entrar na área de uma sala de reunião. */
export function RoomPrompt({ room, occupancy, joining, mediaUnavailable, onJoin, note }: Props) {
  const full = occupancy >= room.capacity;
  const blocked = !room.canAccess;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3 sm:bottom-28">
      <div className="panel-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#131c42]/95 p-3 shadow-2xl backdrop-blur">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--amber)]/15 text-[var(--amber)]">
          {room.isPrivate ? <Lock size={20} /> : <DoorOpen size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{room.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <Users size={12} /> {occupancy}/{room.capacity}
            {room.isPrivate && <span>· privada</span>}
            {full && <span className="text-[#ff9b92]">· cheia</span>}
          </div>
          {note && <div className="mt-0.5 truncate text-[11px] text-[var(--amber)]">{note}</div>}
          {!blocked && !full && !note && <div className="mt-0.5 hidden text-[11px] text-[var(--muted)] sm:block">ou clique numa cadeira da sala</div>}
        </div>
        {blocked ? (
          <span className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--muted)]">Acesso restrito</span>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={joining || full || mediaUnavailable}
            title={mediaUnavailable ? "Áudio/vídeo não configurado no servidor" : undefined}
            className="btn-primary h-10 shrink-0 px-3 text-sm sm:px-4"
          >
            {joining ? "Entrando…" : (
              <>
                Entrar<span className="hidden sm:inline">&nbsp;na reunião</span>
              </>
            )}
            <kbd className="ml-2 hidden rounded bg-black/15 px-1.5 text-[10px] sm:inline">E</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
