import { ArrowRight, Globe2, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createOffice } from "@/app/admin/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { OfficeFields } from "@/components/admin/OfficeFields";
import { requireAdmin } from "@/lib/auth";
import type { Office } from "@/lib/types";

export const metadata: Metadata = { title: "Escritórios" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const { supabase } = await requireAdmin();
  const [{ data: offices }, { data: rooms }, { data: members }] = await Promise.all([
    supabase.from("offices").select("*").order("created_at"),
    supabase.from("rooms").select("office_id"),
    supabase.from("office_members").select("office_id").eq("banned", false),
  ]);
  const count = (rows: { office_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.office_id === id).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-pixel text-3xl text-white">Escritórios</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Cada escritório usa o mapa padrão e tem suas próprias salas, membros e configurações.</p>
      </div>

      <div className="grid gap-3">
        {((offices ?? []) as Office[]).map((o) => (
          <Link key={o.id} href={`/admin/escritorios/${o.id}`} className="card flex items-center justify-between gap-4 p-4 hover:border-white/20">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium text-white">
                {o.name}
                <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-normal text-[var(--muted)]">
                  {o.is_public ? <Globe2 size={11} /> : <Lock size={11} />} {o.is_public ? "aberto" : "privado"}
                </span>
              </div>
              <div className="text-xs text-[var(--muted)]">/{o.slug} · {count(rooms, o.id)} salas · {count(members, o.id)} membros · raio {o.proximity_radius}px</div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[var(--muted)]" />
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Novo escritório</h2>
        <p className="mb-5 text-sm text-[var(--muted)]">As salas de reunião do mapa são criadas automaticamente com as capacidades padrão.</p>
        <ActionForm action={createOffice} submitLabel="Criar escritório" pendingLabel="Criando…" className="space-y-4">
          <OfficeFields />
        </ActionForm>
      </section>
    </div>
  );
}
