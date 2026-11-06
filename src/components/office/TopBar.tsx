"use client";

import { ArrowLeft, CalendarDays, Crosshair, MapPin, Minus, Plus, Shield } from "lucide-react";
import Link from "next/link";
import type { MediaStatus } from "@/lib/media/useMedia";
import type { RealtimeState } from "@/lib/realtime/useOfficeRealtime";
import type { StatusKey } from "@/lib/status";
import { StatusPicker } from "./StatusPicker";

interface Props {
  officeName: string;
  online: number;
  realtimeState: RealtimeState;
  mediaStatus: MediaStatus;
  zoneLabel: string | null;
  zoom: number;
  onZoom: (z: number) => void;
  onRecenter: () => void;
  isManager: boolean;
  officeId: string;
  nearCount: number;
  status: StatusKey;
  onStatus: (s: StatusKey) => void;
  onAgenda: () => void;
  /** Minhas reuniões de hoje (ainda por acontecer). */
  agendaCount: number;
}

const RT_LABEL: Record<RealtimeState, { text: string; color: string }> = {
  connecting: { text: "Conectando", color: "bg-amber-400" },
  connected: { text: "Online", color: "bg-emerald-400" },
  reconnecting: { text: "Reconectando", color: "bg-amber-400 animate-pulse" },
  offline: { text: "Sem conexão", color: "bg-red-400" },
  failed: { text: "Falha", color: "bg-red-400" },
  unconfigured: { text: "Tempo real desativado", color: "bg-zinc-400" },
  duplicate: { text: "Aberto em outra aba", color: "bg-zinc-400" },
  kicked: { text: "Desconectado", color: "bg-red-400" },
  full: { text: "Lotado", color: "bg-red-400" },
};

export function TopBar(p: Props) {
  const rt = RT_LABEL[p.realtimeState];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2 sm:gap-3 sm:p-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-[#131c42]/90 py-1.5 pl-1.5 pr-2 shadow-xl backdrop-blur sm:gap-2 sm:pr-3">
        <Link
          href="/escritorio"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-white/10 hover:text-white"
          title="Voltar aos escritórios"
          aria-label="Voltar aos escritórios"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <div className="truncate font-pixel text-[15px] leading-tight text-white">{p.officeName}</div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${rt.color}`} />
              {rt.text}
            </span>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">
              {p.online} <span className="hidden sm:inline">no escritório</span>
              <span className="sm:hidden">{p.online === 1 ? "pessoa" : "pessoas"}</span>
            </span>
            {p.nearCount > 0 && (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden whitespace-nowrap text-[var(--amber)] sm:inline">{p.nearCount} por perto</span>
              </>
            )}
          </div>
        </div>
        <StatusPicker value={p.status} onChange={p.onStatus} />
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={p.onAgenda}
          className="relative flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-[#131c42]/90 px-2.5 text-xs text-[var(--text)] shadow-xl backdrop-blur hover:bg-white/10 sm:px-3"
          aria-label={p.agendaCount ? `Agenda das salas (${p.agendaCount} reunião(ões) suas hoje)` : "Agenda das salas"}
          title="Agenda das salas"
        >
          <CalendarDays size={15} className="text-[var(--amber)]" />
          <span className="hidden sm:inline">Agenda</span>
          {p.agendaCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[var(--coral)] px-1 text-center text-[10px] font-bold leading-5 text-white">
              {p.agendaCount}
            </span>
          )}
        </button>
        {p.zoneLabel && (
          <div className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-[#131c42]/90 px-3 py-2 text-xs text-[var(--text)] shadow-xl backdrop-blur md:flex">
            <MapPin size={14} className="text-[var(--amber)]" />
            {p.zoneLabel}
          </div>
        )}
        {p.isManager && (
          <Link
            href={`/admin/escritorios/${p.officeId}`}
            className="hidden h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-[#131c42]/90 px-3 text-xs text-[var(--text)] shadow-xl backdrop-blur hover:bg-white/10 sm:flex"
          >
            <Shield size={14} /> Gerenciar
          </Link>
        )}
        <div className="flex items-center rounded-xl border border-white/10 bg-[#131c42]/90 shadow-xl backdrop-blur">
          <button
            type="button"
            className="hidden h-9 w-9 place-items-center rounded-l-xl text-[var(--muted)] hover:bg-white/10 hover:text-white sm:grid"
            onClick={() => p.onZoom(p.zoom - 0.25)}
            aria-label="Afastar"
            title="Afastar"
          >
            <Minus size={16} />
          </button>
          <span className="hidden w-11 text-center text-xs tabular-nums text-[var(--muted)] sm:inline">{Math.round(p.zoom * 100)}%</span>
          <button
            type="button"
            className="hidden h-9 w-9 place-items-center text-[var(--muted)] hover:bg-white/10 hover:text-white sm:grid"
            onClick={() => p.onZoom(p.zoom + 0.25)}
            aria-label="Aproximar"
            title="Aproximar"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-white/10 hover:text-white sm:rounded-l-none sm:rounded-r-xl sm:border-l sm:border-white/10"
            onClick={p.onRecenter}
            aria-label="Centralizar o mapa"
            title="Centralizar o mapa (segure Ctrl e arraste para mover)"
          >
            <Crosshair size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
