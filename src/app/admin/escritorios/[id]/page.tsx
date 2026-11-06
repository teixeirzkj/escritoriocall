import { ArrowLeft, ExternalLink, Image as ImageIcon, KeyRound, LayoutGrid, Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addOfficeUser,
  addRoomMember,
  deleteOffice,
  deleteRoom,
  kickOnline,
  removeOfficeUser,
  removeRoomMember,
  resetOfficeUserPassword,
  saveLayout,
  saveRoom,
  setMemberRole,
  updateOffice,
} from "@/app/admin/actions";
import { ActionButton, ActionForm } from "@/components/admin/ActionForm";
import { LayoutPreview } from "@/components/admin/LayoutPreview";
import { LogoField } from "@/components/admin/LogoField";
import { Labeled, OfficeFields } from "@/components/admin/OfficeFields";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { isOfficeManager, requireUser } from "@/lib/auth";
import { integrationStatus } from "@/lib/env";
import { buildMap, CLASSIC_MEETING_ZONES, DEFAULT_LAYOUT, MAX_DESKS, MAX_ROOM_SEATS, MAX_ROOMS, MIN_DESKS } from "@/lib/game/map";
import { layoutSpecFor, parseLayout } from "@/lib/office-layout";
import { presenceMembers } from "@/lib/realtime/ably-server";
import { ch, type PresenceData } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Office, OfficeMember, Room } from "@/lib/types";

export const metadata: Metadata = { title: "Gerenciar sede" };
export const dynamic = "force-dynamic";

const ROLE_LABEL = { member: "Usuário", moderator: "Administrador(a)", owner: "Admin. principal" } as const;

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
    supabase.from("rooms").select("*").eq("office_id", id).order("zone_key"),
    supabase.from("office_members").select("*").eq("office_id", id).order("joined_at"),
    supabase.from("room_members").select("room_id, user_id"),
  ]);
  const rooms = (roomRows ?? []) as Room[];
  const members = ((memberRows ?? []) as OfficeMember[]).filter((m) => !m.banned);
  const admin = supabaseAdmin();
  const ids = Array.from(new Set([...members.map((m) => m.user_id), ...(roomMemberRows ?? []).map((r) => r.user_id as string)]));
  const [{ data: profileRows }, emails] = await Promise.all([
    ids.length
      ? admin.from("profiles").select("id, display_name, role").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; display_name: string; role: string }[] }),
    Promise.all(members.map((m) => admin.auth.admin.getUserById(m.user_id).then((r) => [m.user_id, r.data.user?.email ?? ""] as const))),
  ]);
  const nameOf = new Map((profileRows ?? []).map((p) => [p.id as string, p.display_name as string]));
  const staff = new Set((profileRows ?? []).filter((p) => p.role === "admin").map((p) => p.id as string));
  const emailOf = new Map(emails);
  const team = members.filter((m) => !staff.has(m.user_id) || m.user_id === user.id);
  const used = members.filter((m) => !staff.has(m.user_id)).length;
  const limit = office.max_members;
  const full = limit !== null && used >= limit;

  const roomIds = new Set(rooms.map((r) => r.id));
  const invites = (roomMemberRows ?? []).filter((r) => roomIds.has(r.room_id as string));
  const myRole = members.find((m) => m.user_id === user.id)?.role ?? null;
  const isOwner = myRole === "owner";
  const layout = parseLayout(office.layout);
  const spec = layoutSpecFor(office.layout, rooms);
  const map = buildMap(spec);
  const zoneLabel = (k: string) => map.zones.find((z) => z.key === k)?.label;
  const usedZones = new Set(rooms.map((r) => r.zone_key));
  const freeClassic = CLASSIC_MEETING_ZONES.filter((z) => !usedZones.has(z.key));
  const canAddRoom = layout ? rooms.length < MAX_ROOMS : freeClassic.length > 0;

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
          <Link href={isAdmin ? "/admin/escritorios" : "/escritorio"} className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-white">
            <ArrowLeft size={14} /> {isAdmin ? "Clientes e sedes" : "Minhas sedes"}
          </Link>
          <div className="flex items-center gap-3">
            {office.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={office.logo_url} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
            )}
            <div>
              <h1 className="font-pixel text-3xl text-white">{office.name}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">/{office.slug}</p>
            </div>
          </div>
        </div>
        <Link href={`/escritorio/${office.slug}`} className="btn-ghost h-10 px-4 text-sm">
          Entrar na sede <ExternalLink size={14} />
        </Link>
      </div>

      {/* Equipe */}
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Users size={17} className="text-[var(--amber)]" /> Equipe
          </h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${full ? "bg-[var(--coral)]/15 text-[#ffb4ad]" : "bg-white/5 text-[var(--muted)]"}`}>
            {used}
            {limit ? ` de ${limit}` : ""} usuários
          </span>
        </div>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Só entra na sede quem estiver aqui. Ao cadastrar, aparece um acesso com senha provisória para você enviar à pessoa.
        </p>

        {/* O formulário fica sempre montado: assim o acesso de quem ocupou a última vaga não some da tela. */}
        {full && (
          <p className="mb-3 rounded-xl border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm text-[#ffb4ad]">
            A sede atingiu o limite de {limit} usuários. Remova alguém ou fale com a gente para aumentar o plano.
          </p>
        )}
        {(
          <ActionForm action={addOfficeUser} submitLabel="Cadastrar pessoa" pendingLabel="Cadastrando…" className="mb-5 space-y-3 rounded-xl border border-dashed border-white/15 p-4" resetOnSuccess>
            <input type="hidden" name="officeId" value={id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_180px]">
              <Labeled label="Nome">
                <input name="name" required minLength={2} maxLength={32} className="input h-10 text-sm" placeholder="João Lima" />
              </Labeled>
              <Labeled label="E-mail">
                <input name="email" type="email" required maxLength={120} className="input h-10 text-sm" placeholder="joao@empresa.com" />
              </Labeled>
              <Labeled label="Permissão">
                <select name="role" defaultValue="member" className="input h-10 text-sm">
                  <option value="member">Usuário</option>
                  <option value="moderator">Administrador(a)</option>
                </select>
              </Labeled>
            </div>
          </ActionForm>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3 font-medium">Pessoa</th>
                <th className="py-2 pr-3 font-medium">Permissão</th>
                <th className="py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {team.map((m) => {
                const self = m.user_id === user.id;
                const locked = self || (m.role === "owner" && !isAdmin && !isOwner);
                const name = nameOf.get(m.user_id) ?? "Pessoa";
                return (
                  <tr key={m.user_id}>
                    <td className="py-2.5 pr-3">
                      <div className="text-white">
                        {name}
                        {self && <span className="ml-2 text-xs text-[var(--muted)]">(você)</span>}
                      </div>
                      <div className="text-xs text-[var(--muted)]">{emailOf.get(m.user_id)}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {locked ? (
                        <span className="text-[var(--muted)]">{ROLE_LABEL[m.role]}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(["member", "moderator", ...(isAdmin || isOwner ? (["owner"] as const) : [])] as const).map((role) => (
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
                      {!locked && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <ActionButton
                            action={resetOfficeUserPassword}
                            fields={{ officeId: id, userId: m.user_id }}
                            label={<span className="inline-flex items-center gap-1"><KeyRound size={12} /> Nova senha</span>}
                            confirm={`Gerar uma senha provisória nova para ${name}? A senha atual para de funcionar.`}
                          />
                          <ActionButton
                            action={removeOfficeUser}
                            fields={{ officeId: id, userId: m.user_id }}
                            label="Remover"
                            className="btn-danger h-8 px-3 text-xs"
                            confirm={`Remover ${name} da sede? A pessoa é desconectada na hora e a vaga fica livre.`}
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
      </section>

      {/* Logo da empresa */}
      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-white">
          <ImageIcon size={17} className="text-[var(--amber)]" /> Logo da empresa
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">Aparece no topo do escritório e num painel na parede da entrada. PNG, JPG ou WEBP de até 1 MB.</p>
        <LogoField officeId={id} target="office" url={office.logo_url} label="Logo da empresa" />
      </section>

      {/* Mapa */}
      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-white">
          <LayoutGrid size={17} className="text-[var(--amber)]" /> Mapa da sede
        </h2>
        {layout ? (
          <p className="mb-4 text-sm text-[var(--muted)]">
            As salas de reunião vêm da lista abaixo (cada uma com as cadeiras que você definir). Aqui você escolhe as mesas de
            trabalho, a copa e a área de lazer.
          </p>
        ) : (
          <p className="mb-4 text-sm text-[var(--muted)]">
            Esta sede usa o mapa clássico (fixo, com 4 salas). Para escolher quantas salas, cadeiras e áreas ela tem, ative o
            mapa personalizado. As salas atuais são mantidas.
          </p>
        )}
        <div className="mb-4">
          <LayoutPreview spec={spec} />
        </div>
        <ActionForm action={saveLayout} submitLabel={layout ? "Salvar mapa" : "Ativar mapa personalizado"} className="space-y-3">
          <input type="hidden" name="officeId" value={id} />
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Labeled label="Lugares na área de trabalho" hint={`${MIN_DESKS} a ${MAX_DESKS} (arredonda para par)`}>
              <input name="desks" type="number" min={MIN_DESKS} max={MAX_DESKS} required defaultValue={(layout ?? DEFAULT_LAYOUT).desks} className="input h-10 text-sm" />
            </Labeled>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-5 text-sm text-white">
              {(
                [
                  ["kitchen", "Copa"],
                  ["pool", "Piscina"],
                  ["games", "Salão de jogos"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" name={k} defaultChecked={(layout ?? DEFAULT_LAYOUT)[k]} className="h-4 w-4 accent-[var(--amber)]" /> {label}
                </label>
              ))}
            </div>
          </div>
        </ActionForm>
      </section>

      {/* Salas */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Salas e setores</h2>
        <p className="mb-5 text-sm text-[var(--muted)]">
          Cada sala tem nome na porta, cor própria e a logo do setor na TV. O áudio e o chat de cada sala são isolados.
        </p>
        <div className="space-y-4">
          {rooms.map((r) => {
            const roomInvites = invites.filter((i) => i.room_id === r.id);
            const invitable = members.filter((m) => !roomInvites.some((i) => i.user_id === m.user_id));
            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <ActionForm action={saveRoom} submitLabel="Salvar sala" className="space-y-3" submitClassName="btn-ghost h-9 px-3 text-sm">
                  <input type="hidden" name="officeId" value={id} />
                  <input type="hidden" name="roomId" value={r.id} />
                  <div className={`grid gap-3 ${layout ? "sm:grid-cols-[1.4fr_120px_1.2fr]" : "sm:grid-cols-[1.4fr_1fr_110px_1.2fr]"}`}>
                    <Labeled label="Nome">
                      <input name="name" defaultValue={r.name} required minLength={2} maxLength={60} className="input h-10 text-sm" />
                    </Labeled>
                    {!layout && (
                      <Labeled label="Área do mapa">
                        <select name="zone_key" defaultValue={r.zone_key} className="input h-10 text-sm">
                          {CLASSIC_MEETING_ZONES.filter((z) => z.key === r.zone_key || !usedZones.has(z.key)).map((z) => (
                            <option key={z.key} value={z.key}>{z.label}</option>
                          ))}
                        </select>
                      </Labeled>
                    )}
                    <Labeled label={layout ? "Cadeiras" : "Capacidade"}>
                      <input name="capacity" type="number" min={1} max={layout ? MAX_ROOM_SEATS : 50} defaultValue={r.capacity} required className="input h-10 text-sm" />
                    </Labeled>
                    <Labeled label="Cor da sala">
                      <ThemePicker value={r.theme} />
                    </Labeled>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white">
                    <input type="checkbox" name="is_private" defaultChecked={r.is_private} className="h-4 w-4 accent-[var(--amber)]" />
                    <Lock size={13} /> Privada (só pessoas com acesso e administradores entram)
                  </label>
                </ActionForm>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Logo do setor (na TV da sala)</h3>
                  <LogoField officeId={id} target={r.id} url={r.logo_url} label={`Logo de ${r.name}`} />
                </div>

                {r.is_private && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Pessoas com acesso</h3>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {roomInvites.length === 0 && <span className="text-sm text-[var(--muted)]">Ninguém ainda.</span>}
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
                          <option value="" disabled>Escolha uma pessoa…</option>
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

        {canAddRoom ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Nova sala</h3>
            <ActionForm action={saveRoom} submitLabel="Criar sala" className="space-y-3" resetOnSuccess>
              <input type="hidden" name="officeId" value={id} />
              <div className={`grid gap-3 ${layout ? "sm:grid-cols-[1.4fr_120px_1.2fr]" : "sm:grid-cols-[1.4fr_1fr_110px_1.2fr]"}`}>
                <Labeled label="Nome">
                  <input name="name" required minLength={2} maxLength={60} className="input h-10 text-sm" placeholder="Setor Comercial" />
                </Labeled>
                {!layout && (
                  <Labeled label="Área do mapa">
                    <select name="zone_key" className="input h-10 text-sm">
                      {freeClassic.map((z) => (
                        <option key={z.key} value={z.key}>{z.label}</option>
                      ))}
                    </select>
                  </Labeled>
                )}
                <Labeled label={layout ? "Cadeiras" : "Capacidade"}>
                  <input name="capacity" type="number" min={1} max={layout ? MAX_ROOM_SEATS : 50} defaultValue={6} required className="input h-10 text-sm" />
                </Labeled>
                <Labeled label="Cor da sala">
                  <ThemePicker value={null} />
                </Labeled>
              </div>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" name="is_private" className="h-4 w-4 accent-[var(--amber)]" /> Privada
              </label>
            </ActionForm>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[var(--muted)]">
            {layout ? `A sede já tem o máximo de ${MAX_ROOMS} salas.` : "Todas as áreas do mapa clássico já têm sala. Ative o mapa personalizado para ter mais."}
          </p>
        )}
      </section>

      {/* Online agora */}
      <section className="card p-5">
        <h2 className="mb-1 font-semibold text-white">Online agora</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">Recarregue a página para atualizar.</p>
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
                    {roomName(o.data?.roomId ?? null) ?? (o.data?.zone ? zoneLabel(o.data.zone) : "Escritório")}
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
          <OfficeFields office={office} isAdmin={isAdmin} />
          {isAdmin && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Labeled label="Limite de usuários (plano)" hint="Só a plataforma vê e altera. Vazio = sem limite.">
                <input name="max_members" type="number" min={1} max={1000} defaultValue={office.max_members ?? ""} className="input h-10 text-sm" />
              </Labeled>
            </div>
          )}
        </ActionForm>
      </section>

      {isAdmin && (
        <section className="card border-[var(--coral)]/30 p-5">
          <h2 className="mb-1 font-semibold text-white">Zona de perigo</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">Excluir apaga salas, equipe, agenda e todo o histórico de mensagens desta sede.</p>
          <ActionButton
            action={deleteOffice}
            fields={{ officeId: id }}
            label="Excluir sede"
            className="btn-danger h-10 px-4 text-sm"
            confirm={`Excluir definitivamente a sede "${office.name}"? Não dá para desfazer.`}
          />
        </section>
      )}
    </div>
  );
}
