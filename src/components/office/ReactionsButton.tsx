"use client";

import { Hand, Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉", "😮"] as const;

/** Botão de reações rápidas + levantar a mão. */
export function ReactionsButton({
  hand,
  onReact,
  onHand,
  onPunch,
}: {
  hand: boolean;
  onReact: (e: string) => void;
  onHand: () => void;
  onPunch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Reações"
        title="Reações"
        className={`group relative grid h-11 w-11 place-items-center rounded-xl transition sm:h-12 sm:w-12 ${hand ? "bg-[var(--amber)] text-white" : "bg-white/5 text-[var(--text)] hover:bg-white/10"}`}
      >
        {hand ? <Hand size={20} /> : <Smile size={20} />}
      </button>
      {open && (
        <div className="panel-in absolute bottom-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[var(--panel)] p-1.5 shadow-2xl sm:bottom-16">
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                // no máximo uma reação a cada 0,6s
                const now = performance.now();
                if (now - lastRef.current < 600) return;
                lastRef.current = now;
                onReact(e);
              }}
              className="grid h-10 w-10 place-items-center rounded-xl text-xl transition hover:scale-110 hover:bg-white/10"
              aria-label={`Reagir com ${e}`}
            >
              {e}
            </button>
          ))}
          <span className="mx-0.5 h-7 w-px bg-white/10" aria-hidden />
          <button
            type="button"
            onClick={onPunch}
            title="Soco de brincadeira em quem estiver mais perto (tecla F)"
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm text-white hover:bg-white/10"
          >
            👊 Soco
          </button>
          <button
            type="button"
            onClick={() => {
              onHand();
              setOpen(false);
            }}
            aria-pressed={hand}
            className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm ${hand ? "bg-[var(--amber)] text-white" : "text-white hover:bg-white/10"}`}
          >
            ✋ {hand ? "Abaixar a mão" : "Levantar a mão"}
          </button>
        </div>
      )}
    </div>
  );
}
