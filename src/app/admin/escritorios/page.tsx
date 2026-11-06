import { ArrowRight, Building2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClientOffice } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { Labeled } from "@/components/admin/OfficeFields";
import { requireAdmin } from "@/lib/auth";
import type { Office } from "@/lib/types";

export const metadata: Metadata = { title: "Clientes e sedes" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const { supabase } = await requireAdmin();
  const [{ data: offices }, { data: rooms }, { data: members }, { data: staff }] = await Promise.all([
    supabase.from("offices").select("*").order("created_at"),
    supabase.from("rooms").select("office_id"),
    supabase.from("office_members").select("office_id, user_id").eq("banned", false),
    supabase.from("profiles").select("id").eq("role", "admin"),
  ]);
  const staffIds = new Set((staff ?? []).map((s) => s.id as string));
  const roomCount = (id: string) => (rooms ?? []).filter((r) => r.office_id === id).length;
  // Usuários do cliente (o pessoal da plataforma não conta no limite).
  const userCount = (id: string) => (members ?? []).filter((m) => m.office_id === id && !staffIds.has(m.user_id as string)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-pixel text-3xl text-white">Clientes e sedes</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cada cliente tem a própria sede, privada: só entra quem o administrador(a) dela cadastrar, até o limite de usuários.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-white">
          <Building2 size={17} className="text-[var(--amber)]" /> Novo cliente
        </h2>
        <p className="mb-5 text-sm text-[var(--muted)]">
          Cria a sede (com 2 salas, área de trabalho, copa e lazer para personalizar depois) e a conta do administrador(a) do
          cliente com uma senha provisória.
        </p>
        <ActionForm action={createClientOffice} submitLabel="Criar cliente" pendingLabel="Criando…" className="space-y-4" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Empresa">
              <input name="name" required minLength={2} maxLength={60} placeholder="Viajafar" className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Endereço (opcional)" hint="Aparece na URL: /escritorio/endereco">
              <input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="viajafar" className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Administrador(a) — nome">
              <input name="admin_name" required minLength={2} maxLength={32} placeholder="Maria Souza" className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Administrador(a) — e-mail">
              <input name="admin_email" type="email" required maxLength={120} placeholder="maria@viajafar.com" className="input h-10 text-sm" />
            </Labeled>
            <Labeled label="Limite de usuários" hint="Contando o administrador(a). Dá para mudar depois.">
              <input name="max_members" type="number" min={1} max={1000} required defaultValue={10} className="input h-10 text-sm" />
            </Labeled>
          </div>
        </ActionForm>
      </section>

      <div className="grid gap-3">
        {((offices ?? []) as Office[]).map((o) => (
          <Link key={o.id} href={`/admin/escritorios/${o.id}`} className="card flex items-center justify-between gap-4 p-4 hover:border-white/20">
            <div className="flex min-w-0 items-center gap-3">
              {o.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-0.5" />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-[var(--amber)]">
                  <Building2 size={18} />
                </span>
              )}
              <div className="min-w-0">
                <div className="font-medium text-white">{o.name}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
                  <span>/{o.slug}</span>
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {userCount(o.id)}
                    {o.max_members ? ` de ${o.max_members}` : ""} usuários
                  </span>
                  <span>{roomCount(o.id)} salas</span>
                  <span>{o.layout ? "mapa personalizado" : "mapa clássico"}</span>
                </div>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[var(--muted)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
