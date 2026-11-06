import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { Meter } from "@/lib/plan";

const fmt = new Intl.NumberFormat("pt-BR");

/** Aviso de uso (70% / 90% do plano), só para a administração da plataforma. */
export function UsageAlert({ alerts }: { alerts: Meter[] }) {
  if (!alerts.length) return null;
  const danger = alerts.some((a) => a.level === "danger");
  return (
    <Link
      href="/admin/uso"
      role="alert"
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition hover:brightness-110 ${
        danger ? "border-[var(--coral)]/50 bg-[var(--coral)]/15 text-[#ffb4ad]" : "border-amber-400/40 bg-amber-400/10 text-amber-200"
      }`}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <span>
        <strong className="text-white">{danger ? "Plano quase no limite" : "Atenção ao uso do plano"}: </strong>
        {alerts.map((a) => `${a.label} em ${fmt.format(a.pct)}% (${fmt.format(a.used)} de ${fmt.format(a.limit)}${a.key === "cf_gb" ? " GB" : ""})`).join(" · ")}.
        {danger
          ? alerts.some((a) => a.key.startsWith("livekit"))
            ? " No plano gratuito do LiveKit a voz e o vídeo param ao chegar em 100%. "
            : " Passando do limite, o excedente é cobrado. "
          : " "}
        <span className="underline">Ver uso e custos</span>
      </span>
    </Link>
  );
}
