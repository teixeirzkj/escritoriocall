import type { Metadata } from "next";
import { deleteUser, setUserRole } from "@/app/admin/actions";
import { ActionButton } from "@/components/admin/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { integrationStatus } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, supabase } = await requireAdmin();
  const q = (sp.q ?? "").trim();
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("display_name", `%${q.replace(/[%_]/g, "")}%`);
  const { data } = await query;
  const profiles = (data ?? []) as Profile[];

  // E-mails ficam em auth.users: só com a chave secreta.
  const emails = new Map<string, string>();
  const lastSeen = new Map<string, string | null>();
  const secret = integrationStatus().supabaseSecret;
  if (secret) {
    try {
      const { data: list } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) {
        emails.set(u.id, u.email ?? "");
        lastSeen.set(u.id, u.last_sign_in_at ?? null);
      }
    } catch {
      /* segue sem e-mails */
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pixel text-3xl text-white">Usuários</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{profiles.length} {profiles.length === 1 ? "pessoa" : "pessoas"}{q ? ` para “${q}”` : ""}.</p>
        </div>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nome" className="input h-10 w-56 text-sm" />
          <button className="btn-ghost h-10 px-4 text-sm">Buscar</button>
        </form>
      </div>

      {!secret && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Configure <code>SUPABASE_SECRET_KEY</code> para ver e-mails, promover administradores e excluir contas.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Pessoa</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Cadastro</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {profiles.map((p) => {
              const last = lastSeen.get(p.id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{p.display_name}{p.id === user.id && <span className="ml-2 text-xs text-[var(--muted)]">(você)</span>}</div>
                    <div className="text-xs text-[var(--muted)]">{emails.get(p.id) ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.role === "admin" ? "bg-[var(--amber)]/15 text-[var(--amber)]" : "bg-white/5 text-[var(--muted)]"}`}>
                      {p.role === "admin" ? "Administrador" : "Usuário"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{dateFmt.format(new Date(p.created_at))}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{last ? dateFmt.format(new Date(last)) : "—"}</td>
                  <td className="px-4 py-3">
                    {p.id !== user.id && secret && (
                      <div className="flex justify-end gap-2">
                        <ActionButton
                          action={setUserRole}
                          fields={{ userId: p.id, role: p.role === "admin" ? "user" : "admin" }}
                          label={p.role === "admin" ? "Remover admin" : "Tornar admin"}
                          confirm={p.role === "admin" ? `Remover o acesso de administrador de ${p.display_name}?` : `Dar acesso de administrador a ${p.display_name}?`}
                        />
                        <ActionButton
                          action={deleteUser}
                          fields={{ userId: p.id }}
                          label="Excluir"
                          className="btn-danger h-8 px-3 text-xs"
                          confirm={`Excluir definitivamente a conta de ${p.display_name}? Esta ação não pode ser desfeita.`}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
