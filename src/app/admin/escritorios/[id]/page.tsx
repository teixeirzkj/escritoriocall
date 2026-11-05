import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addRoomMember,
  deleteOffice,
  deleteRoom,
  kickOnline,
  removeRoomMember,
  saveRoom,
  setMemberBan,
  setMemberRole,
  updateOffice,
} from "@/app/admin/actions";
import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { Labeled, OfficeFields } from "@/components/admin/OfficeFields";
import { isOfficeManager, requireUser } from "@/lib/auth";
import { integrationStatus } from "@/lib/env";
import { MEETING_ZONES, zoneByKey } from "@/lib/game/map";
import { presenceMembers } from "@/lib/realtime/ably-server";
import { ch, type PresenceData } from "@/lib/realtime/channels";
import type { Office, OfficeMember, Room } from "@/lib/types";

export const metadata: Metadata = { title: "Gerenciar escritório" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { member: "Membro", moderator: "Moderador(a)", owner: "Dono(a)" } as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile, supabase } = await requireUser(`/admin/escritorios/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await isOfficeManager(supabase, id))) redirect("/escritorio?erro=sem-permissao");
  const isAdmin = profile.role === "admin";

  const { data: officeRow } = await supabase.from("offices").select("*").eq("id", id).maybeSingle();
  if (!officeRow) notFound();
  const office = officeRow as Office;

  const [{ data: roomRows }, { data: memberRows }, { data: roomMemberRows }] = await Promise.all([
    supabase.from("rooms").select("*").eq("office_id", id).order("name"),
    supabase.from("office_members").select("*").eq("office_id", id).order("joined_at"),
    supabase.from("room_members").select("room_id, user_id"),
  ]);
  const rooms = (roomRows ?? []) as Room[];
  const members = (memberRows ?? []) as OfficeMember[];
  const ids = Array.from(new Set([...members.map((m) => m.user_id), ...(roomMemberRows ?? []).map((r) => r.user_id as string)]));
  const { data: profileRows } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profileRows ?? []).map((p) => [p.id as string, p.display_name as string]));
  const roomIds = new Set(rooms.map((r) => r.id));
  const invites = (roomMemberRows ?? []).filter((r) => roomIds.has(r.room_id as string));
  const usedZones = new Set(rooms.map((r) => r.zone_key));
  const freeZones = MEETING_ZONES.filter((z) => !usedZones.has(z.key));
  const activeMembers = members.filter((m) => !m.banned);

  // Presença em tempo real (Ably REST)
  let online: { id: string; data: PresenceData }[] | null = null;
  if (integrationStatus().ably) {
    try {
      const items = await presenceMembers(ch.office(id));
      const uniq = new Map<string, PresenceData>();
      for (const m of items) if (m.clientId) uniq.set(m.clientId, m.data as PresenceData);
      online = Array.from(uniq, ([uid, data]) => ({ id: uid, data }));
    } catch {
      online = null;
    }
  }
  const roomName = (rid: string | null) => (rid ? rooms.find((r) => r.id === rid)?.name ?? "Reunião" : null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {isAdmin && (
            <Link href="/admin/escritorios" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-white">
              <ArrowLeft size={14} /> Escritórios
            </Link>
          )}
          <h1 className="font-pixel text-3xl text-white">{office.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">/{office.slug}</p>
        </div>
        <Link href={`/escritorio/${office.slug}`} className="btn-ghost h-10 px-4 text-sm">
          Abrir escritório <ExternalLink size={14} />
        </Link>
      </div>

      {/* Online agora */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Online agora</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">Lido em tempo real do Ably. Recarregue a página para atualizar.</p>
        {online === null ? (
          <p className="text-sm text-[var(--muted)]">Indisponível: configure ABLY_API_KEY.</p>
        ) : online.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Ninguém online neste momento.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {online.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className="text-white">{o.data?.name ?? nameOf.get(o.id) ?? "Pessoa"}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {roomName(o.data?.roomId ?? null) ?? (o.data?.zone ? zoneByKey(o.data.zone)?.label : "Escritório")}
                    {" · "}mic {o.data?.mic ? "ligado" : "desligado"} · câmera {o.data?.cam ? "ligada" : "desligada"}
                  </span>
                </div>
                {o.id !== user.id && (
                  <ActionButton action={kickOnline} fields={{ officeId: id, userId: o.id }} label="Desconectar" confirm="Encerrar a sessão desta pessoa agora?" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Configurações */}
      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-white">Configurações do ambiente</h2>
        <ActionForm action={updateOffice} submitLabel="Salvar alterações" className="space-y-4">
          <input type="hidden" name="officeId" value={id} />
          <OfficeFields office={office} />
        </ActionForm>
      </section>

      {/* Salas */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Salas de reunião</h2>
        <p className="mb-5 text-sm text-[var(--muted)]">
          Cada sala ocupa uma área do mapa. O áudio e o chat são isolados: quem está em outra sala não ouve.
        </p>
        <div className="space-y-4">
          {rooms.map((r) => {
            const roomInvites = invites.filter((i) => i.room_id === r.id);
            const invitable = activeMembers.filter((m) => !roomInvites.some((i) => i.user_id === m.user_id));
            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <ActionForm action={saveRoom} submitLabel="Salvar sala" className="space-y-3" submitClassName="btn-ghost h-9 px-3 text-sm">
                  <input type="hidden" name="officeId" value={id} />
                  <input type="hidden" name="roomId" value={r.id} />
                  <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_110px]">
                    <Labeled label="Nome">
                      <input name="name" defaultValue={r.name} required minLength={2} maxLength={60} className="input h-10 text-sm" />
                    </Labeled>
                    <Labeled label="Área do mapa">
                      <select name="zone_key" defaultValue={r.zone_key} className="input h-10 text-sm">
                        {MEETING_ZONES.filter((z) => z.key === r.zone_key || !usedZones.has(z.key)).map((z) => (
                          <option key={z.key} value={z.key}>{z.label}</option>
                        ))}
                      </select>
                    </Labeled>
                    <Labeled label="Capacidade">
                      <input name="capacity" type="number" min={1} max={50} defaultValue={r.capacity} required className="input h-10 text-sm" />
                    </Labeled>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white">
                    <input type="checkbox" name="is_private" defaultChecked={r.is_private} className="h-4 w-4 accent-[var(--amber)]" />
                    <Lock size={13} /> Privada (só pessoas convidadas e gestores entram)
                  </label>
                </ActionForm>

                {r.is_private && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Pessoas com acesso</h3>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {roomInvites.length === 0 && <span className="text-sm text-[var(--muted)]">Ninguém convidado ainda.</span>}
                      {roomInvites.map((i) => (
                        <span key={i.user_id as string} className="inline-flex items-center gap-1 rounded-full bg-white/5 py-0.5 pl-3 pr-1 text-sm text-white">
                          {nameOf.get(i.user_id as string) ?? "Pessoa"}
                          <ActionButton
                            action={removeRoomMember}
                            fields={{ officeId: id, roomId: r.id, userId: i.user_id as string }}
                            label="×"
                            className="grid h-6 w-6 place-items-center rounded-full text-[var(--muted)] hover:bg-white/10 hover:text-white"
                          />
                        </span>
                      ))}
                    </div>
                    {invitable.length > 0 && (
                      <ActionForm action={addRoomMember} submitLabel="Dar acesso" className="flex flex-wrap items-end gap-2" submitClassName="btn-ghost h-9 px-3 text-sm" resetOnSuccess>
                        <input type="hidden" name="officeId" value={id} />
                        <input type="hidden" name="roomId" value={r.id} />
                        <select name="userId" required defaultValue="" className="input h-9 w-56 text-sm">
                          <option value="" disabled>Escolha um membro…</option>
                          {invitable.map((m) => (
                            <option key={m.user_id} value={m.user_id}>{nameOf.get(m.user_id) ?? m.user_id.slice(0, 8)}</option>
                          ))}
                        </select>
                      </ActionForm>
                    )}
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <ActionButton
                    action={deleteRoom}
                    fields={{ officeId: id, roomId: r.id }}
                    label="Remover sala"
                    className="btn-danger h-8 px-3 text-xs"
                    confirm={`Remover a sala "${r.name}"? O histórico do chat da sala também será apagado.`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {freeZones.length > 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Nova sala</h3>
            <ActionForm action={saveRoom} submitLabel="Criar sala" className="space-y-3" resetOnSuccess>
              <input type="hidden" name="officeId" value={id} />
              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_110px]">
                <Labeled label="Nome">
                  <input name="name" required minLength={2} maxLength={60} className="input h-10 text-sm" placeholder="Sala de Foco" />
                </Labeled>
                <Labeled label="Área do mapa">
                  <select name="zone_key" className="input h-10 text-sm">
                    {freeZones.map((z) => (
                      <option key={z.key} value={z.key}>{z.label}</option>
                    ))}
                  </select>
                </Labeled>
                <Labeled label="Capacidade">
                  <input name="capacity" type="number" min={1} max={50} defaultValue={freeZones[0]?.defaultCapacity ?? 6} required className="input h-10 text-sm" />
                </Labeled>
              </div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" name="is_private" className="h-4 w-4 accent-[var(--amber)]" /> Privada
              </label>
            </ActionForm>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[var(--muted)]">Todas as áreas de reunião do mapa já têm uma sala.</p>
        )}
      </section>

      {/* Membros e permissões */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Membros e permissões</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Moderadores e donos gerenciam salas, membros e sessões deste escritório. Remover bloqueia a pessoa e a desconecta na hora.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3 font-medium">Pessoa</th>
                <th className="py-2 pr-3 font-medium">Papel</th>
                <th className="py-2 text-right font-medium">Acesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.map((m) => {
                const self = m.user_id === user.id;
                return (
                  <tr key={m.user_id} className={m.banned ? "opacity-60" : ""}>
                    <td className="py-2.5 pr-3 text-white">
                      {nameOf.get(m.user_id) ?? "Pessoa"}
                      {self && <span className="ml-2 text-xs text-[var(--muted)]">(você)</span>}
                      {m.banned && <span className="ml-2 rounded bg-[var(--coral)]/15 px-1.5 text-[11px] text-[#ffb4ad]">bloqueado</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      {self ? (
                        <span className="text-[var(--muted)]">{ROLE_LABEL[m.role]}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(["member", "moderator", ...(isAdmin ? (["owner"] as const) : [])] as const).map((role) => (
                            <ActionButton
                              key={role}
                              action={setMemberRole}
                              fields={{ officeId: id, userId: m.user_id, role }}
                              label={ROLE_LABEL[role]}
                              className={`h-7 rounded-md px-2 text-xs ${m.role === role ? "bg-[var(--amber)] font-semibold text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"}`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {!self &&
                        (m.banned ? (
                          <ActionButton action={setMemberBan} fields={{ officeId: id, userId: m.user_id, banned: "false" }} label="Restaurar acesso" />
                        ) : (
                          <ActionButton
                            action={setMemberBan}
                            fields={{ officeId: id, userId: m.user_id, banned: "true" }}
                            label="Remover"
                            className="btn-danger h-8 px-3 text-xs"
                            confirm={`Remover ${nameOf.get(m.user_id) ?? "esta pessoa"} do escritório? Ela será desconectada e não poderá voltar até você restaurar o acesso.`}
                          />
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="card border-[var(--coral)]/30 p-5">
          <h2 className="mb-1 font-semibold text-white">Zona de perigo</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Excluir apaga salas, membros e todo o histórico de mensagens deste escritório.</p>
          <ActionButton
            action={deleteOffice}
            fields={{ officeId: id }}
            label="Excluir escritório"
            className="btn-danger h-10 px-4 text-sm"
            confirm={`Excluir definitivamente o escritório "${office.name}"?`}
          />
        </section>
      )}
    </div>
  );
}
