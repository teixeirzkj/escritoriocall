/** Status de disponibilidade exibido ao lado do nome. */
export type StatusKey = "disponivel" | "ocupado" | "almoco" | "ausente" | "nao-perturbe";

export const STATUSES: { key: StatusKey; label: string; emoji: string; color: string }[] = [
  { key: "disponivel", label: "Disponível", emoji: "🟢", color: "#22c55e" },
  { key: "ocupado", label: "Ocupado", emoji: "🔴", color: "#ef4444" },
  { key: "almoco", label: "Almoçando", emoji: "🍽️", color: "#f59e0b" },
  { key: "ausente", label: "Ausente", emoji: "🌙", color: "#94a3b8" },
  { key: "nao-perturbe", label: "Não perturbe", emoji: "⛔", color: "#e0564c" },
];

export function statusInfo(key: unknown) {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}

const KEY = "fredy:status";
export function loadStatus(): StatusKey {
  try {
    const v = window.localStorage.getItem(KEY);
    return STATUSES.some((s) => s.key === v) ? (v as StatusKey) : "disponivel";
  } catch {
    return "disponivel";
  }
}
export function saveStatus(s: StatusKey) {
  try {
    window.localStorage.setItem(KEY, s);
  } catch {
    /* ignora */
  }
}
