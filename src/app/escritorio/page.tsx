import { ArrowRight, Building2, Crown, Link2, Plus, Settings, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createMyOffice, leaveOffice } from "@/app/escritorio/actions";
import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import type { Office } from "@/lib/types";

export const metadata: Metadata = { title: "Minhas sedes" };

const ERRORS: Record<string, string> = {
  "sem-permissao": "Você não tem permissão para acessar aquela área.",
  "sem-acesso": "Essa sede é privada. Para entrar, peça o link de convite a quem a administra.",
  banido: "Seu acesso àquela sede foi removido por quem a administra.",
};

const ROLE = {
  owner: { label: "Dono(a)", icon: Crown },
  moderator: { label: "Moderador(a)", icon: Shield },
  member: { label: "Membro", icon: null },
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, profile, supabase } = await requireUser("/escritorio");
  if (!profile.avatar_config) redirect("/personagem?next=/escritorio");

  // Só as sedes de que a pessoa participa (inclusive para o administrador da plataforma).
  const { data: memberships } = await supabase
    .from("office_members")
    .select("office_id, role, banned")
    .eq("user_id", user.id)
    .eq("banned", false);
  const ids = (memberships ?? []).map((m) => m.office_id as string);
  const { data: offices } = ids.length
    ? await supabase.from("offices").select("*").in("id", ids).order("created_at")
    : { data: [] as Office[] };
  const roleOf = new Map((memberships ?? []).map((m) => [m.office_id as string, m.role as keyof typeof ROLE]));
  const list = (offices ?? []) as Office[];
  const error = sp.erro ? ERRORS[sp.erro] : undefined;

  return (
    <div className="min-h-dvh">
      <AppHeader profile={profile} />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-pixel text-3xl text-white sm:text-4xl">Olá, {profile.display_name.split(" ")[0]}!</h1>
        <p className="mt-2 text-[var(--muted)]">
          {list.length ? "Escolha uma sede para entrar." : "Crie a sua sede ou entre pelo link de convite que alguém te mandou."}
        </p>
        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-[var(--coral)]/40 bg-[var(--coral)]/10 px-4 py-3 text-sm text-[#ffb4ad]">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => {
            const role = roleOf.get(o.id) ?? "member";
            const R = ROLE[role];
            const manager = role !== "member";
            return (
              <div key={o.id} className="card group relative flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-[var(--amber)]/40">
                <div className="mb-4 flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--amber)]/15 text-[var(--amber)]">
                    <Building2 size={20} />
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {R.icon && <R.icon size={11} />}
                    {R.label}
                  </span>
                </div>
                <h2 className="font-semibold text-white">
                  <Link href={`/escritorio/${o.slug}`} className="after:absolute after:inset-0">
                    {o.name}
                  </Link>
                </h2>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-[var(--muted)]">{o.description || "Sem descrição."}</p>
                <div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    {manager ? (
                      <Link
                        href={`/admin/escritorios/${o.id}`}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-2.5 text-xs text-[var(--muted)] hover:bg-white/10 hover:text-white"
                      >
                        <Settings size={13} /> Personalizar e convidar
                      </Link>
                    ) : (
                      <ActionButton
                        action={leaveOffice}
                        fields={{ officeId: o.id }}
                        label="Sair da sede"
                        className="h-8 rounded-lg px-2.5 text-xs text-[var(--muted)] hover:bg-white/10 hover:text-white"
                        confirm={`Sair de "${o.name}"? Para voltar, você vai precisar de um novo convite.`}
                      />
                    )}
                  </div>
                  <Link href={`/escritorio/${o.slug}`} className="flex items-center gap-1 font-medium text-[var(--amber)] transition group-hover:translate-x-0.5">
                    Entrar <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            );
          })}

          {/* Criar sede */}
          <div className="card flex flex-col border-dashed p-5">
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-[var(--amber)]">
              <Plus size={20} />
            </span>
            <h2 className="font-semibold text-white">Criar uma sede</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Sua sede é privada: só entra quem você convidar pelo link. Depois você renomeia as salas e personaliza.
            </p>
            <ActionForm action={createMyOffice} submitLabel="Criar sede" pendingLabel="Criando…" className="mt-4 space-y-3" submitClassName="btn-primary h-10 px-4 text-sm">
              <input name="name" required minLength={2} maxLength={60} placeholder="Nome da sede (ex.: Time Comercial)" aria-label="Nome da sede" className="input h-10 text-sm" />
            </ActionForm>
          </div>
        </div>

        <p className="mt-8 flex items-center gap-2 text-sm text-[var(--muted)]">
          <Link2 size={14} /> Recebeu um link de convite? É só abrir o link e clicar em <strong className="text-white">Aceitar convite</strong>.
        </p>
      </main>
    </div>
  );
}
