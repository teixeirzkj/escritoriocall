/** Aceita só caminhos internos (evita redirecionamento aberto). */
export function safeNext(next: string | null | undefined, fallback = "/escritorio"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
