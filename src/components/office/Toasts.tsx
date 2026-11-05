"use client";

import { CheckCircle2, DoorOpen, Info, TriangleAlert, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export type ToastTone = "info" | "success" | "error" | "join";
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, tone: ToastTone = "info") => {
      const id = ++seq.current;
      setToasts((t) => [...t.filter((x) => x.text !== text), { id, text, tone }].slice(-4));
      window.setTimeout(() => dismiss(id), tone === "error" || tone === "join" ? 6000 : 3500);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-24 left-3 z-[70] flex flex-col gap-2 sm:bottom-6 sm:left-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "join" ? "status" : undefined}
          className={`panel-in pointer-events-auto flex max-w-xs items-start gap-2 rounded-xl border bg-[#131c42]/95 px-3 py-2.5 text-sm text-white shadow-xl backdrop-blur ${t.tone === "join" ? "border-[var(--amber)] shadow-[0_0_0_3px_rgba(43,106,243,0.25)]" : "border-white/10"}`}
        >
          {t.tone === "join" ? (
            <DoorOpen size={16} className="mt-0.5 shrink-0 text-[var(--amber)]" />
          ) : t.tone === "success" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
          ) : t.tone === "error" ? (
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[var(--coral)]" />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0 text-[var(--amber)]" />
          )}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => onDismiss(t.id)} className="text-[var(--muted)] hover:text-white" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
