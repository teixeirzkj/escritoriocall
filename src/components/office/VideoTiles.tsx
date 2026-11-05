"use client";

import { Maximize2, MonitorUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VideoTile } from "@/lib/media/useMedia";

export function TrackVideo({ tile, className }: { tile: VideoTile; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    tile.track.attach(el);
    return () => {
      tile.track.detach(el);
    };
  }, [tile.track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`${className ?? ""} ${tile.isLocal && tile.source === "camera" ? "mirror-local" : ""}`}
    />
  );
}

/** Faixa de vídeos por proximidade (topo da tela). Clique num vídeo para ampliar. */
export function ProximityStrip({ tiles, nearIds, speakers }: { tiles: VideoTile[]; nearIds: string[]; speakers: Set<string> }) {
  const visible = tiles.filter((t) => t.isLocal || nearIds.includes(t.identity));
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const expanded = visible.find((t) => t.key === expandedKey) ?? null;

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpandedKey(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (!visible.length) return null;
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-3">
        <div className="pointer-events-auto flex max-w-full gap-2.5 overflow-x-auto pb-1">
          {visible.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setExpandedKey(t.key)}
              aria-label={`Ampliar ${t.source === "screen" ? "a tela de" : "o vídeo de"} ${t.isLocal ? "você" : t.name}`}
              className={`group relative shrink-0 overflow-hidden rounded-2xl border-2 bg-black shadow-xl ${speakers.has(t.identity) ? "border-[var(--amber)]" : "border-white/10"} ${t.source === "screen" ? "h-40 w-72 sm:h-56 sm:w-[400px]" : "h-32 w-44 sm:h-40 sm:w-56"}`}
            >
              <TrackVideo tile={t} className={`h-full w-full ${t.source === "screen" ? "object-contain" : "object-cover"}`} />
              <span className="absolute bottom-1.5 left-1.5 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                {t.source === "screen" && <MonitorUp size={11} className="mr-1 inline" />}
                {t.isLocal ? "Você" : t.name}
              </span>
              <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                <Maximize2 size={14} />
              </span>
            </button>
          ))}
        </div>
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-[45] flex items-center justify-center bg-black/85 p-3 pb-24 sm:p-8 sm:pb-28"
          role="dialog"
          aria-label={expanded.isLocal ? "Seu vídeo ampliado" : `Vídeo de ${expanded.name}`}
          onClick={() => setExpandedKey(null)}
        >
          <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black" onClick={(e) => e.stopPropagation()}>
            <TrackVideo tile={expanded} className="h-full w-full object-contain" />
            <div className="absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1 text-sm text-white">
              {expanded.source === "screen" && <MonitorUp size={14} className="mr-1 inline" />}
              {expanded.isLocal ? "Você" : expanded.name}
            </div>
            <button
              type="button"
              onClick={() => setExpandedKey(null)}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80"
              aria-label="Fechar vídeo ampliado"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
