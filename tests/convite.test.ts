import { describe, expect, it } from "vitest";
import { inviteUrl, newInviteCode, officeSlug } from "@/lib/invite";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/; // mesma regra do banco

describe("convites e endereços de sede", () => {
  it("código do convite: 12 caracteres seguros e diferentes a cada vez", () => {
    const codes = new Set(Array.from({ length: 500 }, newInviteCode));
    expect(codes.size).toBe(500);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{12}$/);
  });

  it("endereço vem do nome, sem acento, e passa na regra do banco", () => {
    expect(officeSlug("Time Comercial Ágil!", "x7k2")).toBe("time-comercial-agil-x7k2");
    expect(officeSlug("  ***  ", "ab12")).toBe("sede-ab12");
    expect(officeSlug("A", "ab12")).toBe("a-ab12");
    for (const n of ["Tête à tête", "Sede da Duda 🚀", "x".repeat(60), "Ação & Reação --- ltda"]) {
      expect(officeSlug(n)).toMatch(SLUG_RE);
    }
  });

  it("monta o link de convite", () => {
    expect(inviteUrl("https://fredyescritorio.vercel.app/", "abc123def456")).toBe(
      "https://fredyescritorio.vercel.app/convite/abc123def456",
    );
  });
});
