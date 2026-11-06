import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Acesso por convite" };

/** Cadastro fechado: as contas são criadas pela plataforma ou pelo administrador(a) da empresa. */
export default function Page() {
  return (
    <div className="space-y-4 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--amber)]/15 text-[var(--amber)]">
        <Lock size={22} />
      </span>
      <h1 className="font-pixel text-2xl text-white">Acesso por convite</h1>
      <p className="text-sm text-[var(--muted)]">
        As contas são criadas pelo administrador(a) da sua empresa. Peça a ele(a) o seu acesso. Sua empresa ainda não
        tem o escritório? Fale com a gente.
      </p>
      <Link href="/entrar" className="btn-primary h-11 w-full">Já tenho acesso: entrar</Link>
    </div>
  );
}
