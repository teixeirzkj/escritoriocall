import { ArrowRight, Building2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/app/escritorio/actions";
import { ActionForm } from "@/components/admin/ActionForm";
import { Logo } from "@/components/Logo";
import { getProfile, getSessionUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Link de convite para uma sede: mostra o nome da sede e o botão "Aceitar convite". */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const valid = /^[a-z0-9]{8,32}$/.test(code);
  const admin = supabaseAdmin();
  const { data: office } = valid
    ? await admin.from("offices").select("id, slug, name, description").eq("invite_code", code).maybeSingle()
    : { data: null };

  const { user, supabase } = await getSessionUser();
  const here = `/convite/${code}`;
  let member: { banned: boolean } | null = null;
  if (office && user) {
    const profile = await getProfile(supabase, user.id);
    if (!profile?.avatar_config) redirect(`/personagem?next=${encodeURIComponent(here)}`);
    const { data } = await admin
      .from("office_members")
      .select("banned")
      .eq("office_id", office.id)
      .eq("user_id", user.id)
      .maybeSingle();
    member = data;
  }
  const { count } = office
    ? await admin.from("office_members").select("user_id", { count: "exact", head: true }).eq("office_id", office.id).eq("banned", false)
    : { count: 0 };

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="pixel-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 text-center shadow-2xl shadow-black/40 sm:p-8">
          {!office ? (
            <>
              <h1 className="font-pixel text-2xl text-white">Convite inválido</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Este link não funciona mais. Peça um link novo a quem te convidou.
              </p>
              <Link href={user ? "/escritorio" : "/entrar"} className="btn-ghost mt-6 h-11 w-full">
                {user ? "Ir para minhas sedes" : "Entrar"}
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--amber)]/15 text-[var(--amber)]">
                <Building2 size={26} />
              </span>
              <p className="mt-4 text-sm text-[var(--muted)]">Você foi convidado(a) para a sede</p>
              <h1 className="mt-1 font-pixel text-3xl text-white">{office.name}</h1>
              {office.description && <p className="mt-2 text-sm text-[var(--muted)]">{office.description}</p>}
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">
                <Users size={12} /> {count ?? 0} {count === 1 ? "pessoa" : "pessoas"}
              </p>

              <div className="mt-7">
                {!user ? (
                  <div className="space-y-3">
                    <Link href={`/entrar?next=${encodeURIComponent(here)}`} className="btn-primary h-11 w-full">
                      Entrar para aceitar
                    </Link>
                    <p className="text-xs text-[var(--muted)]">Sem conta? Peça o acesso ao administrador(a) da sede.</p>
                  </div>
                ) : member?.banned ? (
                  <p className="text-sm text-[#ffb4ad]">Seu acesso a esta sede foi removido por quem a administra.</p>
                ) : member ? (
                  <Link href={`/escritorio/${office.slug}`} className="btn-primary h-11 w-full">
                    Você já está aqui: entrar <ArrowRight size={16} />
                  </Link>
                ) : (
                  <ActionForm
                    action={acceptInvite}
                    submitLabel="Aceitar convite"
                    pendingLabel="Entrando…"
                    className="space-y-3 [&>div]:justify-center"
                    submitClassName="btn-primary h-11 w-full"
                  >
                    <input type="hidden" name="code" value={code} />
                  </ActionForm>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
