import Link from "next/link";

/** Marca Frédy: "Fr" no tom claro/marinho e "édy" no azul da marca. */
export function Wordmark({ size = "text-2xl", dark = false }: { size?: string; dark?: boolean }) {
  return (
    <span className={`font-brand font-extrabold leading-none tracking-tight ${size}`}>
      <span className={dark ? "text-[#1a2140]" : "text-white"}>Fr</span>
      <span className="text-[var(--amber)]">édy</span>
    </span>
  );
}

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-baseline gap-2 ${className}`} aria-label="Frédy — página inicial">
      <Wordmark />
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">escritório</span>
    </Link>
  );
}
