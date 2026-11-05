import { ArrowRight, Building2, Globe2, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import type { Office } from "@/lib/types";

export const metadata: Metadata = { title: "Escritórios" };

const ERRORS: Record<string, string> = {
  "sem-permissao": "Você não tem permissão para acessar aquela área.",
  "sem-acesso": "Este escritório é privado. Peça acesso a um administrador.",
  banido: "Seu acesso àquele escritório foi removido por um administrador.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, profile, supabase } = await requireUser("/escritorio");
  if (!profile.avatar_config) redirect("/personagem?next=/escritorio");

  const [{ data: offices }, { data: memberships }] = await Promise.all([
    supabase.from("offices").select("*").order("created_at"),
    supabase.from("office_members").select("office_id, role, banned").eq("user_id", user.id),
  ]);
  const memberOf = new Map((memberships ?? []).map((m) => [m.office_id as string, m]));
  const list = ((offices ?? []) as Office[]).filter((o) => !memberOf.get(o.id)?.banned);
  const error = sp.erro ? ERRORS[sp.erro] : undefined;

  return (
    <div className="min-h-dvh">
      <AppHeader profile={profile} />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-pixel text-3xl text-white sm:text-4xl">Olá, {profile.display_name.split(" ")[0]}!</h1>
        <p className="mt-2 text-[var(--muted)]">Escolha um escritório para entrar.</p>
        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-[var(--coral)]/40 bg-[var(--coral)]/10 px-4 py-3 text-sm text-[#ffb4ad]">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => {
            const m = memberOf.get(o.id);
            return (
              <Link
                key={o.id}
                href={`/escritorio/${o.slug}`}
                className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-[var(--amber)]/40"
              >
                <div className="mb-4 flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--amber)]/15 text-[var(--amber)]">
                    <Building2 size={20} />
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {o.is_public ? <Globe2 size={11} /> : <Lock size={11} />}
                    {o.is_public ? "Aberto" : "Privado"}
                  </span>
                </div>
                <h2 className="font-semibold text-white">{o.name}</h2>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-[var(--muted)]">{o.description || "Sem descrição."}</p>
                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-xs text-[var(--muted)]">
                    {m ? (m.role === "member" ? "Você é membro" : m.role === "owner" ? "Você é dono(a)" : "Você é moderador(a)") : "Entrar pela primeira vez"}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-[var(--amber)] transition group-hover:translate-x-0.5">
                    Entrar <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className="card mt-8 p-8 text-center">
            <h2 className="font-semibold text-white">Nenhum escritório disponível</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Ainda não há escritórios abertos para você. Se você administra a plataforma, rode as migrations do
              Supabase (elas criam o escritório &quot;Sede&quot;) ou crie um escritório na administração.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
