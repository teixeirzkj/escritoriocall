"use client";

import { BellRing, Check, DoorClosed, Navigation, Pin, X } from "lucide-react";
import type { KnockMsg, RingMsg } from "@/lib/realtime/channels";

/** "Fulano está te chamando" — com atalho para ir até a pessoa. */
export function RingPrompt({ ring, onGo, onDismiss }: { ring: RingMsg; onGo: () => void; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-3">
      <div
        role="alertdialog"
        aria-label={`${ring.fromName} está te chamando`}
        className="panel-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border-2 border-[var(--amber)] bg-[var(--panel)] p-3 shadow-[0_0_0_6px_rgba(43,106,243,0.18)]"
      >
        <span className="grid h-11 w-11 shrink-0 animate-bounce place-items-center rounded-xl bg-[var(--amber)] text-white">
          <BellRing size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{ring.fromName} está te chamando</div>
          <div className="truncate text-xs text-[var(--muted)]">{ring.where}</div>
        </div>
        <button type="button" onClick={onGo} className="btn-primary h-9 shrink-0 px-3 text-sm">
          <Navigation size={14} /> Ir
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white"
          aria-label="Dispensar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Pedidos para entrar na sala trancada (para quem está dentro). */
export function KnockRequests({
  knocks,
  busy,
  onAnswer,
}: {
  knocks: KnockMsg[];
  busy: boolean;
  onAnswer: (k: KnockMsg, accept: boolean) => void;
}) {
  if (!knocks.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-3">
      {knocks.map((k) => (
        <div
          key={k.fromId}
          role="alertdialog"
          aria-label={`${k.fromName} quer entrar`}
          className="panel-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-[var(--panel)] p-3 shadow-2xl"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
            <DoorClosed size={18} />
          </span>
          <div className="min-w-0 flex-1 text-sm text-white">
            <b className="font-semibold">{k.fromName}</b> bateu na porta
          </div>
          <button type="button" disabled={busy} onClick={() => onAnswer(k, true)} className="btn-primary h-9 shrink-0 px-3 text-sm">
            <Check size={14} /> Abrir
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer(k, false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white"
            aria-label={`Recusar ${k.fromName}`}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Cartão ao sentar numa mesa: definir / liberar a mesa fixa. */
export function DeskPrompt({
  ownerName,
  mine,
  busy,
  onClaim,
  onRelease,
  onClose,
}: {
  ownerName: string | null;
  mine: boolean;
  busy: boolean;
  onClaim: () => void;
  onRelease: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3 sm:bottom-28">
      <div className="panel-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[var(--panel)]/95 p-3 shadow-2xl backdrop-blur">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--amber)]/15 text-[var(--amber)]">
          <Pin size={18} />
        </span>
        <div className="min-w-0 flex-1 text-sm text-white">
          {mine ? "Esta é a sua mesa" : ownerName ? `Mesa de ${ownerName}` : "Mesa livre"}
          <div className="text-xs text-[var(--muted)]">
            {mine
              ? "Você começa aqui toda vez que entra."
              : ownerName
                ? "Você pode sentar, mas ela é de outra pessoa."
                : "Quer que seja a sua? Você começa aqui ao entrar."}
          </div>
        </div>
        {mine ? (
          <button type="button" disabled={busy} onClick={onRelease} className="btn-ghost h-9 shrink-0 px-3 text-sm">
            Liberar
          </button>
        ) : !ownerName ? (
          <button type="button" disabled={busy} onClick={onClaim} className="btn-primary h-9 shrink-0 px-3 text-sm">
            É minha
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
