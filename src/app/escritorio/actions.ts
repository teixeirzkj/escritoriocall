"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/app/admin/actions";
import { assertOfficeManager, assertUser, HttpError } from "@/lib/auth";
import { MEETING_ZONES } from "@/lib/game/map";
import { newInviteCode, officeSlug } from "@/lib/invite";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Quantas sedes uma pessoa pode criar (evita abuso). */
const MAX_OWNED = 5;

function fail(e: unknown): ActionResult {
  if (e instanceof HttpError) return { ok: false, message: e.message };
  if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Dados inválidos" };
  console.error("[sede]", e);
  return { ok: false, message: "Não foi possível concluir. Tente de novo." };
}

const nameSchema = z.string().trim().min(2, "O nome precisa ter pelo menos 2 letras").max(60, "Nome muito longo");

/** Cria uma sede nova: quem cria vira dono(a) e já ganha as salas padrão. */
export async function createMyOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { user } = await assertUser();
    if (!rateLimit(`office-create:${user.id}`, 3, 60_000).ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const name = nameSchema.parse(fd.get("name"));
    const admin = supabaseAdmin();
    const { count } = await admin
      .from("office_members")
      .select("office_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "owner");
    if ((count ?? 0) >= MAX_OWNED) throw new HttpError(400, `Você já é dono(a) de ${MAX_OWNED} sedes. Exclua uma para criar outra.`);

    let office: { id: string } | null = null;
    for (let i = 0; i < 4 && !office; i++) {
      const { data, error } = await admin
        .from("offices")
        .insert({
          slug: officeSlug(name),
          name,
          is_public: false,
          proximity_radius: 208,
          proximity_mode: "fade",
          max_online: 25,
          created_by: user.id,
          invite_code: newInviteCode(),
        })
        .select("id")
        .single();
      if (error && error.code !== "23505") throw error;
      office = data;
    }
    if (!office) throw new HttpError(500, "Não foi possível criar a sede. Tente outro nome.");
    id = office.id;
    const { error: me } = await admin.from("office_members").insert({ office_id: id, user_id: user.id, role: "owner" });
    if (me) throw me;
    const { error: re } = await admin.from("rooms").insert(
      MEETING_ZONES.map((zn) => ({
        office_id: id,
        zone_key: zn.key,
        name: zn.label,
        capacity: zn.defaultCapacity ?? 6,
        is_private: false,
      })),
    );
    if (re) throw re;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/escritorio");
  redirect(`/admin/escritorios/${id}?nova=1`);
}

/** Aceita o convite (link) e entra na sede. */
export async function acceptInvite(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let slug: string;
  try {
    const { user } = await assertUser();
    if (!rateLimit(`invite:${user.id}`, 10, 60_000).ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const code = z.string().regex(/^[a-z0-9]{8,32}$/, "Convite inválido").parse(fd.get("code"));
    const admin = supabaseAdmin();
    const { data: office } = await admin.from("offices").select("id, slug").eq("invite_code", code).maybeSingle();
    if (!office) throw new HttpError(404, "Este convite não vale mais. Peça um link novo a quem te convidou.");
    slug = office.slug as string;
    const { data: member } = await admin
      .from("office_members")
      .select("banned")
      .eq("office_id", office.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member?.banned) throw new HttpError(403, "Seu acesso a esta sede foi removido por quem a administra.");
    if (!member) {
      const { error } = await admin.from("office_members").insert({ office_id: office.id, user_id: user.id, role: "member" });
      if (error && error.code !== "23505") throw error;
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/escritorio");
  redirect(`/escritorio/${slug}`);
}

/** Gera um link de convite novo (o antigo para de funcionar). */
export async function regenerateInvite(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    await assertOfficeManager(officeId);
    const { error } = await supabaseAdmin().from("offices").update({ invite_code: newInviteCode() }).eq("id", officeId);
    if (error) throw error;
    revalidatePath(`/admin/escritorios/${officeId}`);
    return { ok: true, message: "Link novo gerado. O anterior não funciona mais." };
  } catch (e) {
    return fail(e);
  }
}

/** Sair de uma sede (quem é o único dono precisa excluir a sede ou passar a posse antes). */
export async function leaveOffice(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const officeId = z.uuid().parse(fd.get("officeId"));
    const { user } = await assertUser();
    const admin = supabaseAdmin();
    const { data: mine } = await admin
      .from("office_members")
      .select("role")
      .eq("office_id", officeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!mine) throw new HttpError(404, "Você não está nesta sede.");
    if (mine.role === "owner") {
      const { count } = await admin
        .from("office_members")
        .select("user_id", { count: "exact", head: true })
        .eq("office_id", officeId)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) throw new HttpError(400, "Você é o único dono(a). Passe a posse para alguém ou exclua a sede.");
    }
    const { error } = await admin.from("office_members").delete().eq("office_id", officeId).eq("user_id", user.id);
    if (error) throw error;
    try {
      await publishServer(ch.control(officeId), "control", { type: "kick", userId: user.id, reason: "left" });
    } catch {
      /* sem Ably */
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/escritorio");
  redirect("/escritorio");
}
