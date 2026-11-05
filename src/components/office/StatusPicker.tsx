"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STATUSES, type StatusKey, statusInfo } from "@/lib/status";

/** Botão de status ("Disponível", "Ocupado", "Não perturbe"...). */
export function StatusPicker({ value, onChange }: { value: StatusKey; onChange: (s: StatusKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = statusInfo(value);

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
        aria-label={`Seu status: ${cur.label}. Clique para mudar.`}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs text-white hover:bg-white/10"
      >
        <span aria-hidden>{cur.emoji}</span>
        <span className="hidden sm:inline">{cur.label}</span>
        <ChevronDown size={13} className="text-[var(--muted)]" />
      </button>
      {open && (
        <ul className="panel-in absolute left-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 shadow-2xl">
          {STATUSES.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.key);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
              >
                <span aria-hidden>{s.emoji}</span>
                <span className="flex-1">{s.label}</span>
                {s.key === value && <Check size={14} className="text-[var(--amber)]" />}
              </button>
            </li>
          ))}
          <li className="px-3 pb-1.5 pt-1 text-[11px] leading-snug text-[var(--muted)]">
            Em “Não perturbe” ninguém conecta com você por proximidade e os chamados chegam sem som.
          </li>
        </ul>
      )}
    </div>
  );
}
