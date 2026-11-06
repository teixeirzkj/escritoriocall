/** Convites e endereços de sede (funções puras, testadas). */

/** Código do link de convite: 12 caracteres [a-z0-9]. */
export function newInviteCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** Endereço da sede a partir do nome: "Time Ágil!" -> "time-agil-x7k2". */
export function officeSlug(name: string, suffix = newInviteCode().slice(0, 4)): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return `${base || "sede"}-${suffix}`;
}

export function inviteUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/convite/${code}`;
}
