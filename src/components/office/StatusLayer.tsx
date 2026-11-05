"use client";

import { AlertTriangle, RefreshCw, Volume2 } from "lucide-react";
import Link from "next/link";
import type { MediaStatus } from "@/lib/media/useMedia";
import type { RealtimeState } from "@/lib/realtime/useOfficeRealtime";

interface Props {
  realtimeState: RealtimeState;
  mediaStatus: MediaStatus;
  mediaError: string | null;
  audioBlocked: boolean;
  onStartAudio: () => void;
  onRetryMedia: () => void;
  onReload: () => void;
}

const BLOCKING: Partial<Record<RealtimeState, { title: string; text: string }>> = {
  duplicate: {
    title: "Escritório aberto em outra aba",
    text: "Você entrou no escritório por outra aba ou dispositivo. Esta sessão foi encerrada para evitar conexões duplicadas.",
  },
  kicked: {
    title: "Você foi desconectado",
    text: "Um administrador removeu seu acesso ou encerrou sua sessão neste escritório.",
  },
  full: {
    title: "Escritório lotado",
    text: "O limite de pessoas online neste escritório foi atingido. Tente novamente em alguns minutos.",
  },
  failed: {
    title: "Não foi possível conectar",
    text: "A conexão em tempo real falhou. Verifique sua internet e tente novamente.",
  },
};

export function StatusLayer(p: Props) {
  const block = BLOCKING[p.realtimeState];
  return (
    <>
      {block && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b112b]/85 p-4 backdrop-blur">
          <div className="panel-in max-w-sm rounded-2xl border border-white/10 bg-[#131c42] p-6 text-center shadow-2xl">
            <AlertTriangle className="mx-auto mb-3 text-[var(--amber)]" />
            <h2 className="mb-2 font-semibold text-white">{block.title}</h2>
            <p className="mb-5 text-sm text-[var(--muted)]">{block.text}</p>
            <div className="flex justify-center gap-2">
              <Link href="/escritorio" className="btn-ghost h-10 px-4 text-sm">Voltar</Link>
              {p.realtimeState !== "kicked" && (
                <button type="button" onClick={p.onReload} className="btn-primary h-10 px-4 text-sm">
                  Usar esta aba
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-[72px] z-[39] flex flex-col items-center gap-2 px-3 sm:top-20">
        {p.realtimeState === "unconfigured" && (
          <Banner tone="warn">
            Tempo real desativado: configure <code>ABLY_API_KEY</code> no servidor para ver outras pessoas e usar o chat.
          </Banner>
        )}
        {(p.realtimeState === "reconnecting" || p.realtimeState === "offline") && (
          <Banner tone="warn">
            <RefreshCw size={14} className="mr-1 inline animate-spin" /> Conexão instável — reconectando automaticamente…
          </Banner>
        )}
        {p.mediaStatus === "unconfigured" && (
          <Banner tone="muted">
            Áudio e vídeo indisponíveis: configure <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> e <code>LIVEKIT_API_SECRET</code>.
          </Banner>
        )}
        {p.mediaStatus === "duplicate" && <Banner tone="warn">Áudio/vídeo conectado em outra aba.</Banner>}
        {p.mediaStatus === "error" && (
          <Banner tone="warn">
            Áudio/vídeo: {p.mediaError ?? "erro de conexão"}{" "}
            <button type="button" className="pointer-events-auto ml-1 underline" onClick={p.onRetryMedia}>
              Tentar de novo
            </button>
          </Banner>
        )}
        {p.audioBlocked && (
          <button
            type="button"
            onClick={p.onStartAudio}
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-white shadow-xl"
          >
            <Volume2 size={16} /> Clique para ativar o áudio
          </button>
        )}
      </div>
    </>
  );
}

function Banner({ tone, children }: { tone: "warn" | "muted"; children: React.ReactNode }) {
  return (
    <div
      className={`pointer-events-auto max-w-xl rounded-xl border px-3 py-2 text-center text-xs shadow-xl backdrop-blur ${tone === "warn" ? "border-amber-400/30 bg-amber-950/80 text-amber-100" : "border-white/10 bg-[#131c42]/90 text-[var(--muted)]"}`}
    >
      {children}
    </div>
  );
}
