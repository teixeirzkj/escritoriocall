"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/app/admin/actions";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Formulário ligado a uma Server Action, com feedback de sucesso/erro. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Salvando…",
  className = "",
  resetOnSuccess = false,
  submitClassName = "btn-primary h-10 px-4 text-sm",
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={submitClassName}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? "text-emerald-300" : "text-[#ffb4ad]"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

/** Botão único que dispara uma Server Action com campos fixos. */
export function ActionButton({
  action,
  fields,
  label,
  confirm,
  className = "btn-ghost h-8 px-3 text-xs",
}: {
  action: Action;
  fields: Record<string, string>;
  label: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? "…" : label}
      </button>
      {state && !state.ok && !pending && <span className="text-xs text-[#ffb4ad]">{state.message}</span>}
    </form>
  );
}
