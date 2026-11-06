"use server";

import { randomBytes } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, assertOfficeManager, assertUser, getProfile, HttpError } from "@/lib/auth";
import { MissingEnvError, serverLiveKit } from "@/lib/env";
import {
  CLASSIC_MEETING_ZONES,
  DEFAULT_LAYOUT,
  GEN_ROOM_KEY,
  MAX_ROOM_SEATS,
  MAX_ROOMS,
  nextRoomKey,
} from "@/lib/game/map";
import { isThemeValue } from "@/lib/brand";
import { newInviteCode, officeSlug } from "@/lib/invite";
import { deskCountFor, layoutOptionsSchema, parseLayout } from "@/lib/office-layout";
import { clearUsageCache, planLimitsSchema } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch, lk, type ControlMsg } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ActionResult = {
  ok: boolean;
  message: string;
  /** Texto para copiar (ex.: acesso com senha provisória). Mostrado uma única vez. */
  secret?: string;
  /** Link para seguir depois do sucesso. */
  href?: string;
} | null;

function fail(e: unknown): ActionResult {
  if (e instanceof HttpError) return { ok: false, message: e.message };
  if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof MissingEnvError) return { ok: false, message: `Configure no servidor: ${e.names.join(", ")}` };
  const pg = e as { code?: string; message?: string };
  if (pg?.code === "23505") return { ok: false, message: "Já existe um registro com esse identificador." };
  if (pg?.code === "42501") return { ok: false, message: "Sem permissão para esta operação." };
  if (pg?.code === "23514") return { ok: false, message: "Valor fora dos limites permitidos." };
  console.error("[admin]", e);
  return { ok: false, message: "Não foi possível concluir a operação." };
}

/** Avisa os clientes conectados (se o Ably estiver configurado). */
async function notify(officeId: string, msg: ControlMsg) {
  try {
    await publishServer(ch.control(officeId), "control", msg);
  } catch {
    /* Ably ausente: as mudanças valem no próximo carregamento */
  }
}

/** Derruba a mídia de um usuário em todas as salas do escritório. */
async function dropMedia(officeId: string, userId: string, roomIds: string[]) {
  let cfg;
  try {
    cfg = serverLiveKit();
  } catch {
    return;
  }
  const svc = new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  const names = [lk.proximity(officeId), ...roomIds.map((r) => lk.room(officeId, r))];
  await Promise.all(names.map((n) => svc.removeParticipant(n, userId).catch(() => {})));
}

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Limite de pessoas online numa sede criada por usuário (controle de custo). */
const MAX_ONLINE_OWNER = 50;

const officeSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Endereço: 3–40 letras minúsculas, números ou hífen"),
  description: z.string().trim().max(280).optional().transform((v) => v || null),
  // Toda sede é privada (entra só quem tem o link de convite).
  is_public: z.any().transform(() => false),
  proximity_radius: z.coerce.number().int().min(48, "Raio mínimo: 48").max(480, "Raio máximo: 480"),
  proximity_mode: z.enum(["cutoff", "fade"]),
  max_online: z.coerce.number().int().min(1).max(500),
  // Limite de usuários: só a plataforma altera (vazio = sem limite).
  max_members: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(1000)])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

// ---------------------------------------------------------------------------
// Escritórios
// ---------------------------------------------------------------------------

export async function createOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { user, supabase } = await assertAdmin();
    const data = officeSchema.parse(Object.fromEntries(fd));
    const { data: office, error } = await supabase
      .from("offices")
      .insert({ ...data, layout: DEFAULT_LAYOUT, invite_code: newInviteCode(), created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;
    id = office.id;
    await supabase.from("office_members").insert({ office_id: id, user_id: user.id, role: "owner" });
    await supabase.from("rooms").insert([
      { office_id: id, zone_key: "sala-01", name: "Sala de Reunião", capacity: 8, is_private: false },
      { office_id: id, zone_key: "sala-02", name: "Sala 2", capacity: 4, is_private: false },
    ]);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/escritorios");
  redirect(`/admin/escritorios/${id}`);
}

export async function updateOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { supabase, user } = await assertOfficeManager(officeId);
    const { max_members, ...data } = officeSchema.parse(Object.fromEntries(fd));
    const profile = await getProfile(supabase, user.id);
    const isAdmin = profile?.role === "admin";
    if (!isAdmin && data.max_online > MAX_ONLINE_OWNER) {
      throw new HttpError(400, `O máximo de pessoas online por sede é ${MAX_ONLINE_OWNER}.`);
    }
    const row = isAdmin && fd.has("max_members") ? { ...data, max_members } : data;
    const { error } = await supabaseAdmin().from("offices").update(row).eq("id", officeId);
    if (error) throw error;
    await notify(officeId, { type: "office-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Escritório atualizado." };
  } catch (e) {
    return fail(e);
  }
}

/** Papel da pessoa na sede (ou null). */
async function roleIn(officeId: string, userId: string) {
  const { data } = await supabaseAdmin()
    .from("office_members")
    .select("role, banned")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data && !data.banned ? (data.role as "member" | "moderator" | "owner") : null;
}

/** Excluir a sede: dono(a) da sede ou administrador da plataforma. */
export async function deleteOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let isAdmin = false;
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { user, supabase } = await assertUser();
    isAdmin = (await getProfile(supabase, user.id))?.role === "admin";
    if (!isAdmin) throw new HttpError(403, "Só a administração da plataforma exclui sedes.");
    await notify(officeId, { type: "office-updated" });
    const { error } = await supabaseAdmin().from("offices").delete().eq("id", officeId);
    if (error) throw error;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/escritorio");
  revalidatePath("/admin/escritorios");
  redirect(isAdmin ? "/admin/escritorios" : "/escritorio");
}

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  officeId: z.uuid(),
  roomId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  zone_key: z.string().optional(),
  name: z.string().trim().min(2, "Nome muito curto").max(60),
  capacity: z.coerce.number().int().min(1, "Mínimo: 1 cadeira").max(50, "Máximo: 50"),
  is_private: bool,
  /** "" = sem identidade, chave de identidade pronta, ou "custom" (usa theme_color). */
  theme_preset: z.string().optional(),
  theme_color: z.string().optional(),
});

export async function saveRoom(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const data = roomSchema.parse(Object.fromEntries(fd));
    const { supabase } = await assertOfficeManager(data.officeId);
    const theme = data.theme_preset === "custom" ? data.theme_color?.toLowerCase() : data.theme_preset;
    const admin = supabaseAdmin();
    const [{ data: office }, { data: existing }] = await Promise.all([
      admin.from("offices").select("layout").eq("id", data.officeId).single(),
      admin.from("rooms").select("id, zone_key").eq("office_id", data.officeId),
    ]);
    const generated = parseLayout(office?.layout) !== null;
    let zoneKey: string;
    if (generated) {
      // Mapa gerado: a sala cria a própria área no mapa (cadeiras = capacidade).
      if (data.capacity > MAX_ROOM_SEATS) throw new HttpError(400, `Cada sala pode ter até ${MAX_ROOM_SEATS} cadeiras.`);
      const mine = (existing ?? []).find((r) => r.id === data.roomId);
      if (!data.roomId && (existing ?? []).length >= MAX_ROOMS) throw new HttpError(400, `A sede pode ter até ${MAX_ROOMS} salas.`);
      zoneKey = mine && GEN_ROOM_KEY.test(mine.zone_key as string)
        ? (mine.zone_key as string)
        : nextRoomKey((existing ?? []).map((r) => r.zone_key as string));
    } else {
      if (!data.zone_key || !CLASSIC_MEETING_ZONES.some((z) => z.key === data.zone_key)) throw new HttpError(400, "Área do mapa inválida");
      zoneKey = data.zone_key;
    }
    const row = {
      zone_key: zoneKey,
      name: data.name,
      capacity: data.capacity,
      is_private: data.is_private,
      theme: isThemeValue(theme) ? theme : null,
    };
    const { error } = data.roomId
      ? await supabase.from("rooms").update(row).eq("id", data.roomId).eq("office_id", data.officeId)
      : await supabase.from("rooms").insert({ ...row, office_id: data.officeId });
    if (error) throw error;
    await notify(data.officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${data.officeId}`);
    return { ok: true, message: data.roomId ? "Sala atualizada." : "Sala criada." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRoom(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const roomId = z.uuid().parse(fd.get("roomId"));
    const { supabase } = await assertOfficeManager(officeId);
    const { error } = await supabase.from("rooms").delete().eq("id", roomId).eq("office_id", officeId);
    if (error) throw error;
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Sala removida." };
  } catch (e) {
    return fail(e);
  }
}

export async function addRoomMember(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const roomId = z.uuid().parse(fd.get("roomId"));
    const userId = z.uuid("Escolha uma pessoa").parse(fd.get("userId"));
    const { user, supabase } = await assertOfficeManager(officeId);
    const { error } = await supabase.from("room_members").insert({ room_id: roomId, user_id: userId, added_by: user.id });
    if (error) throw error;
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Acesso concedido." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeRoomMember(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const roomId = z.uuid().parse(fd.get("roomId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const { supabase } = await assertOfficeManager(officeId);
    const { error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
    if (error) throw error;
    await dropMedia(officeId, userId, [roomId]);
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Acesso removido." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Membros do escritório
// ---------------------------------------------------------------------------

export async function setMemberRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const role = z.enum(["member", "moderator", "owner"]).parse(fd.get("role"));
    const { supabase, user } = await assertOfficeManager(officeId);
    if (userId === user.id) throw new HttpError(400, "Você não pode alterar o seu próprio papel aqui.");
    const isAdmin = (await getProfile(supabase, user.id))?.role === "admin";
    const mine = await roleIn(officeId, user.id);
    const target = await roleIn(officeId, userId);
    // Só dono(a) (ou admin) dá posse ou mexe em outro dono(a).
    if ((role === "owner" || target === "owner") && !isAdmin && mine !== "owner") {
      throw new HttpError(403, "Só o dono(a) da sede pode fazer isso.");
    }
    const { error } = await supabaseAdmin().from("office_members").update({ role }).eq("office_id", officeId).eq("user_id", userId);
    if (error) throw error;
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Permissão atualizada." };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberBan(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const banned = fd.get("banned") === "true";
    const { supabase, user } = await assertOfficeManager(officeId);
    if (userId === user.id) throw new HttpError(400, "Você não pode remover a si mesmo.");
    if ((await roleIn(officeId, userId)) === "owner" && (await roleIn(officeId, user.id)) !== "owner") {
      if ((await getProfile(supabase, user.id))?.role !== "admin") throw new HttpError(403, "Só o dono(a) pode remover outro dono(a).");
    }
    const { error } = await supabase.from("office_members").update({ banned }).eq("office_id", officeId).eq("user_id", userId);
    if (error) throw error;
    if (banned) {
      const { data: rooms } = await supabase.from("rooms").select("id").eq("office_id", officeId);
      await notify(officeId, { type: "kick", userId, reason: "banned" });
      await dropMedia(officeId, userId, (rooms ?? []).map((r) => r.id as string));
    }
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: banned ? "Pessoa removida e bloqueada neste escritório." : "Acesso restaurado." };
  } catch (e) {
    return fail(e);
  }
}

export async function kickOnline(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const { supabase, user } = await assertOfficeManager(officeId);
    if (userId === user.id) throw new HttpError(400, "Você não pode desconectar a si mesmo.");
    const { data: rooms } = await supabase.from("rooms").select("id").eq("office_id", officeId);
    await publishServer(ch.control(officeId), "control", { type: "kick", userId } satisfies ControlMsg);
    await dropMedia(officeId, userId, (rooms ?? []).map((r) => r.id as string));
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Sessão encerrada." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Usuários (global) — exigem a chave secreta do Supabase
// ---------------------------------------------------------------------------

export async function setUserRole(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const userId = z.uuid().parse(fd.get("userId"));
    const role = z.enum(["user", "admin"]).parse(fd.get("role"));
    const { user } = await assertAdmin();
    const admin = supabaseAdmin();
    if (role === "user") {
      if (userId === user.id) throw new HttpError(400, "Você não pode remover o seu próprio acesso de administrador.");
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1) throw new HttpError(400, "É preciso manter ao menos um administrador.");
    }
    const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
    if (error) throw error;
    revalidatePath("/admin/usuarios");
    return { ok: true, message: role === "admin" ? "Agora é administrador." : "Acesso de administrador removido." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const userId = z.uuid().parse(fd.get("userId"));
    const { user } = await assertAdmin();
    if (userId === user.id) throw new HttpError(400, "Você não pode excluir a sua própria conta aqui.");
    const admin = supabaseAdmin();
    const { data: offices } = await admin.from("office_members").select("office_id").eq("user_id", userId);
    for (const o of offices ?? []) await notify(o.office_id as string, { type: "kick", userId, reason: "deleted" });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    revalidatePath("/admin/usuarios");
    return { ok: true, message: "Conta excluída." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Clientes: sede + administrador(a), equipe com limite de usuários
// ---------------------------------------------------------------------------

/** Senha provisória fácil de ditar (sem 0/O, 1/l). */
function tempPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const s = Array.from(bytes, (b) => abc[b % abc.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(120);
const personName = z.string().trim().min(2, "Nome muito curto").max(32, "Nome: até 32 letras");

/** Acha uma conta pelo e-mail (null se não existe). */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const admin = supabaseAdmin();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return { id: u.id };
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Cria a conta (com senha provisória) ou reaproveita a existente. */
async function ensureAccount(email: string, name: string): Promise<{ id: string; password: string | null }> {
  const admin = supabaseAdmin();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, must_change_password: true },
  });
  if (!error && data.user) return { id: data.user.id, password };
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, password: null };
  throw error ?? new Error("Não foi possível criar a conta");
}

/** Pessoas ativas que contam no limite (o pessoal da plataforma não conta). */
async function seatsUsed(officeId: string): Promise<number> {
  const admin = supabaseAdmin();
  const { data: members } = await admin.from("office_members").select("user_id").eq("office_id", officeId).eq("banned", false);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (!ids.length) return 0;
  const { data: staff } = await admin.from("profiles").select("id").in("id", ids).eq("role", "admin");
  return ids.length - (staff ?? []).length;
}

function accessText(officeName: string, email: string, password: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://fredyescritorio.vercel.app";
  return `Acesso ao escritório virtual ${officeName}\nSite: ${site}/entrar\nE-mail: ${email}\nSenha provisória: ${password}\n(no primeiro acesso você escolhe uma senha nova)`;
}

const clientSchema = z.object({
  name: z.string().trim().min(2, "Nome da empresa muito curto").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(v), "Endereço: 3–40 letras minúsculas, números ou hífen"),
  max_members: z.coerce.number().int().min(1, "Limite mínimo: 1").max(1000, "Limite máximo: 1000"),
  admin_name: personName,
  admin_email: emailSchema,
});

/** Plataforma: cria a sede do cliente, já com mapa personalizável, e a conta do administrador dele. */
export async function createClientOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const { user } = await assertAdmin();
    const data = clientSchema.parse(Object.fromEntries(fd));
    const admin = supabaseAdmin();
    let office: { id: string; slug: string } | null = null;
    for (let i = 0; i < 4 && !office; i++) {
      const { data: row, error } = await admin
        .from("offices")
        .insert({
          slug: i === 0 && data.slug ? data.slug : officeSlug(data.name),
          name: data.name,
          is_public: false,
          proximity_radius: 208,
          proximity_mode: "fade",
          max_online: Math.min(500, Math.max(10, data.max_members)),
          max_members: data.max_members,
          layout: DEFAULT_LAYOUT,
          created_by: user.id,
          invite_code: newInviteCode(),
        })
        .select("id, slug")
        .single();
      if (error && error.code !== "23505") throw error;
      if (error && i === 0 && data.slug) throw new HttpError(400, "Esse endereço já está em uso. Escolha outro.");
      office = row;
    }
    if (!office) throw new HttpError(500, "Não foi possível criar a sede.");
    const { error: re } = await admin.from("rooms").insert([
      { office_id: office.id, zone_key: "sala-01", name: "Sala de Reunião", capacity: 8, is_private: false },
      { office_id: office.id, zone_key: "sala-02", name: "Sala 2", capacity: 4, is_private: false },
    ]);
    if (re) throw re;
    const acc = await ensureAccount(data.admin_email, data.admin_name);
    const { error: me } = await admin.from("office_members").insert({ office_id: office.id, user_id: acc.id, role: "owner" });
    if (me) throw me;
    revalidatePath("/admin/escritorios");
    return {
      ok: true,
      message: acc.password
        ? "Cliente criado! Envie o acesso abaixo para o administrador(a)."
        : "Cliente criado! Esse e-mail já tinha conta: a pessoa entra com a senha que já usa.",
      secret: acc.password ? accessText(data.name, data.admin_email, acc.password) : undefined,
      href: `/admin/escritorios/${office.id}`,
    };
  } catch (e) {
    return fail(e);
  }
}

const memberRole = z.enum(["member", "moderator", "owner"]);

/** Administrador(a) da sede cadastra uma pessoa da equipe (respeitando o limite). */
export async function addOfficeUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { user, supabase } = await assertOfficeManager(officeId);
    if (!rateLimit(`add-user:${user.id}`, 20, 60_000).ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const name = personName.parse(fd.get("name"));
    const email = emailSchema.parse(fd.get("email"));
    const role = memberRole.parse(fd.get("role") || "member");
    const isAdmin = (await getProfile(supabase, user.id))?.role === "admin";
    if (role === "owner" && !isAdmin && (await roleIn(officeId, user.id)) !== "owner") {
      throw new HttpError(403, "Só o dono(a) da sede cadastra outro administrador(a) principal.");
    }
    const admin = supabaseAdmin();
    const { data: office } = await admin.from("offices").select("name, max_members").eq("id", officeId).single();
    if (office?.max_members && (await seatsUsed(officeId)) >= office.max_members) {
      throw new HttpError(400, `A sede já está com ${office.max_members} usuários (o limite do plano). Remova alguém ou fale com a gente para aumentar.`);
    }
    const acc = await ensureAccount(email, name);
    const { data: existing } = await admin
      .from("office_members")
      .select("banned")
      .eq("office_id", officeId)
      .eq("user_id", acc.id)
      .maybeSingle();
    if (existing && !existing.banned) throw new HttpError(400, "Essa pessoa já está na sede.");
    const { error } = existing
      ? await admin.from("office_members").update({ banned: false, role }).eq("office_id", officeId).eq("user_id", acc.id)
      : await admin.from("office_members").insert({ office_id: officeId, user_id: acc.id, role });
    if (error) throw error;
    revalidatePath(`/admin/escritorios/${officeId}`);
    return {
      ok: true,
      message: acc.password ? `${name} cadastrado(a). Envie o acesso abaixo.` : `${name} já tinha conta e agora tem acesso à sede.`,
      secret: acc.password ? accessText(office?.name ?? "", email, acc.password) : undefined,
    };
  } catch (e) {
    return fail(e);
  }
}

/** Pode mexer na conta (senha/exclusão)? Só se a pessoa for apenas desta sede (ou quem pede é da plataforma). */
async function ownsAccount(officeId: string, targetId: string, requesterIsAdmin: boolean) {
  const admin = supabaseAdmin();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", targetId).maybeSingle();
  if (prof?.role === "admin") return false;
  if (requesterIsAdmin) return true;
  const { data: other } = await admin.from("office_members").select("office_id").eq("user_id", targetId).neq("office_id", officeId).limit(1);
  return !other?.length;
}

/** Remove a pessoa da sede (libera a vaga). Se ela só tinha esta sede, a conta é excluída. */
export async function removeOfficeUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const { supabase, user } = await assertOfficeManager(officeId);
    if (userId === user.id) throw new HttpError(400, "Você não pode remover a si mesmo.");
    const isAdmin = (await getProfile(supabase, user.id))?.role === "admin";
    if ((await roleIn(officeId, userId)) === "owner" && !isAdmin && (await roleIn(officeId, user.id)) !== "owner") {
      throw new HttpError(403, "Só o dono(a) pode remover outro dono(a).");
    }
    const admin = supabaseAdmin();
    const deleteAccount = await ownsAccount(officeId, userId, false);
    const { data: rooms } = await admin.from("rooms").select("id").eq("office_id", officeId);
    await notify(officeId, { type: "kick", userId, reason: "banned" });
    await dropMedia(officeId, userId, (rooms ?? []).map((r) => r.id as string));
    const { error } = await admin.from("office_members").delete().eq("office_id", officeId).eq("user_id", userId);
    if (error) throw error;
    if (deleteAccount) await admin.auth.admin.deleteUser(userId);
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: deleteAccount ? "Pessoa removida e conta excluída." : "Pessoa removida da sede." };
  } catch (e) {
    return fail(e);
  }
}

/** Gera uma senha provisória nova para alguém da equipe. */
export async function resetOfficeUserPassword(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const userId = z.uuid().parse(fd.get("userId"));
    const { supabase, user } = await assertOfficeManager(officeId);
    const isAdmin = (await getProfile(supabase, user.id))?.role === "admin";
    if (!(await roleIn(officeId, userId))) throw new HttpError(404, "Essa pessoa não está na sede.");
    if (!(await ownsAccount(officeId, userId, isAdmin))) {
      throw new HttpError(403, "Essa conta também participa de outra sede: a própria pessoa troca a senha em “Esqueci minha senha”.");
    }
    const admin = supabaseAdmin();
    const password = tempPassword();
    const { data: u, error } = await admin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (error) throw error;
    const { data: office } = await admin.from("offices").select("name").eq("id", officeId).single();
    return { ok: true, message: "Senha nova gerada. Envie o acesso abaixo.", secret: accessText(office?.name ?? "", u.user.email ?? "", password) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Mapa da sede (salas, mesas, copa, lazer) e logos
// ---------------------------------------------------------------------------

export async function saveLayout(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    await assertOfficeManager(officeId);
    const layout = layoutOptionsSchema.parse({
      desks: fd.get("desks"),
      kitchen: fd.get("kitchen") === "on",
      pool: fd.get("pool") === "on",
      games: fd.get("games") === "on",
    });
    const admin = supabaseAdmin();
    const { data: rooms } = await admin.from("rooms").select("id, zone_key, capacity").eq("office_id", officeId).order("zone_key");
    // Vindo do mapa clássico: as salas ganham chaves do mapa gerado (sala-01…).
    const used = (rooms ?? []).map((r) => r.zone_key as string).filter((k) => GEN_ROOM_KEY.test(k));
    for (const r of rooms ?? []) {
      const patch: Record<string, unknown> = {};
      if (!GEN_ROOM_KEY.test(r.zone_key as string)) {
        const k = nextRoomKey(used);
        used.push(k);
        patch.zone_key = k;
      }
      if ((r.capacity as number) > MAX_ROOM_SEATS) patch.capacity = MAX_ROOM_SEATS;
      if (Object.keys(patch).length) {
        const { error } = await admin.from("rooms").update(patch).eq("id", r.id);
        if (error) throw error;
      }
    }
    const { error } = await admin.from("offices").update({ layout }).eq("id", officeId);
    if (error) throw error;
    // Mesas fixas que deixaram de existir voltam a ficar livres.
    const { data: fresh } = await admin.from("rooms").select("zone_key, capacity").eq("office_id", officeId);
    const desks = deskCountFor(layout, fresh ?? []);
    await admin.from("office_members").update({ desk: null }).eq("office_id", officeId).gte("desk", desks);
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Mapa atualizado. Quem estiver na sede vê o novo mapa ao recarregar." };
  } catch (e) {
    return fail(e);
  }
}

const LOGO_TYPES: [string, string, (b: Uint8Array) => boolean][] = [
  ["image/png", "png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/jpeg", "jpg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/webp", "webp", (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45],
];

function storagePath(url: string | null | undefined): string | null {
  const m = url?.match(/\/storage\/v1\/object\/public\/marcas\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Envia a logo da empresa (target = "office") ou de um setor (target = id da sala). */
export async function uploadLogo(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const target = z.union([z.literal("office"), z.uuid()]).parse(fd.get("target"));
    const { user } = await assertOfficeManager(officeId);
    if (!rateLimit(`logo:${user.id}`, 20, 60_000).ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Escolha uma imagem.");
    if (file.size > 1024 * 1024) throw new HttpError(400, "A imagem pode ter no máximo 1 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = LOGO_TYPES.find(([, , ok]) => ok(bytes));
    if (!kind) throw new HttpError(400, "Use PNG, JPG ou WEBP.");
    const admin = supabaseAdmin();
    const table = target === "office" ? "offices" : "rooms";
    const q = admin.from(table).select("logo_url");
    const { data: row } = target === "office" ? await q.eq("id", officeId).single() : await q.eq("id", target).eq("office_id", officeId).single();
    if (!row) throw new HttpError(404, "Sala não encontrada.");
    const path = `${officeId}/${target === "office" ? "empresa" : target}-${randomBytes(4).toString("hex")}.${kind[1]}`;
    const { error: ue } = await admin.storage.from("marcas").upload(path, bytes, { contentType: kind[0], upsert: false, cacheControl: "31536000" });
    if (ue) throw ue;
    const url = admin.storage.from("marcas").getPublicUrl(path).data.publicUrl;
    const upd = admin.from(table).update({ logo_url: url });
    const { error } = target === "office" ? await upd.eq("id", officeId) : await upd.eq("id", target).eq("office_id", officeId);
    if (error) throw error;
    const old = storagePath(row.logo_url as string | null);
    if (old) await admin.storage.from("marcas").remove([old]);
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Logo enviada." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeLogo(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const target = z.union([z.literal("office"), z.uuid()]).parse(fd.get("target"));
    await assertOfficeManager(officeId);
    const admin = supabaseAdmin();
    const table = target === "office" ? "offices" : "rooms";
    const q = admin.from(table).select("logo_url");
    const { data: row } = target === "office" ? await q.eq("id", officeId).single() : await q.eq("id", target).eq("office_id", officeId).single();
    const upd = admin.from(table).update({ logo_url: null });
    const { error } = target === "office" ? await upd.eq("id", officeId) : await upd.eq("id", target).eq("office_id", officeId);
    if (error) throw error;
    const old = storagePath(row?.logo_url as string | null);
    if (old) await admin.storage.from("marcas").remove([old]);
    await notify(officeId, { type: "rooms-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Logo removida." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Limites dos planos (avisos de uso)
// ---------------------------------------------------------------------------

export async function savePlanLimits(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    await assertAdmin();
    const value = planLimitsSchema.parse(Object.fromEntries(fd));
    const { error } = await supabaseAdmin()
      .from("platform_settings")
      .upsert({ key: "plan_limits", value, updated_at: new Date().toISOString() });
    if (error) throw error;
    clearUsageCache();
    revalidatePath("/admin/uso");
    return { ok: true, message: "Limites salvos." };
  } catch (e) {
    return fail(e);
  }
}
