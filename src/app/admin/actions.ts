"use server";

import { RoomServiceClient } from "livekit-server-sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, assertOfficeManager, HttpError } from "@/lib/auth";
import { MissingEnvError, serverLiveKit } from "@/lib/env";
import { MEETING_ZONE_KEYS, MEETING_ZONES } from "@/lib/game/map";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch, lk, type ControlMsg } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ActionResult = { ok: boolean; message: string } | null;

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

const officeSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Endereço: 3–40 letras minúsculas, números ou hífen"),
  description: z.string().trim().max(280).optional().transform((v) => v || null),
  is_public: bool,
  proximity_radius: z.coerce.number().int().min(48, "Raio mínimo: 48").max(480, "Raio máximo: 480"),
  proximity_mode: z.enum(["cutoff", "fade"]),
  max_online: z.coerce.number().int().min(1).max(500),
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
      .insert({ ...data, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;
    id = office.id;
    await supabase.from("office_members").insert({ office_id: id, user_id: user.id, role: "owner" });
    await supabase.from("rooms").insert(
      MEETING_ZONES.map((z) => ({
        office_id: id,
        zone_key: z.key,
        name: z.label,
        capacity: z.defaultCapacity ?? 6,
        is_private: false,
      })),
    );
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/escritorios");
  redirect(`/admin/escritorios/${id}`);
}

export async function updateOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { supabase } = await assertOfficeManager(officeId);
    const data = officeSchema.parse(Object.fromEntries(fd));
    const { error } = await supabase.from("offices").update(data).eq("id", officeId);
    if (error) throw error;
    await notify(officeId, { type: "office-updated" });
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Escritório atualizado." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { supabase } = await assertAdmin();
    const { error } = await supabase.from("offices").delete().eq("id", officeId);
    if (error) throw error;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin/escritorios");
  redirect("/admin/escritorios");
}

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

const roomSchema = z.object({
  officeId: z.uuid(),
  roomId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  zone_key: z.string().refine((k) => MEETING_ZONE_KEYS.includes(k), "Área do mapa inválida"),
  name: z.string().trim().min(2, "Nome muito curto").max(60),
  capacity: z.coerce.number().int().min(1, "Capacidade mínima: 1").max(50, "Capacidade máxima: 50"),
  is_private: bool,
});

export async function saveRoom(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const data = roomSchema.parse(Object.fromEntries(fd));
    const { supabase } = await assertOfficeManager(data.officeId);
    const row = { zone_key: data.zone_key, name: data.name, capacity: data.capacity, is_private: data.is_private };
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
    const { error } = await supabase.from("office_members").update({ role }).eq("office_id", officeId).eq("user_id", userId);
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
