"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUser, HttpError } from "@/lib/auth";
import { avatarConfigSchema } from "@/lib/avatar";
import { publicSupabaseUrl } from "@/lib/env";

const schema = z.object({
  displayName: z.string().trim().min(2, "O nome precisa ter ao menos 2 caracteres").max(32, "Máximo de 32 caracteres"),
  avatarId: z.string().max(40).nullable(),
  avatar: avatarConfigSchema,
  photoUrl: z.url().max(500).nullable(),
});

export type SaveCharacterResult = { ok: true } | { ok: false; error: string };

export async function saveCharacter(input: unknown): Promise<SaveCharacterResult> {
  try {
    const { user, supabase } = await assertUser();
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    const data = parsed.data;

    // Só aceita foto do próprio diretório no bucket "avatars".
    if (data.photoUrl) {
      const prefix = `${publicSupabaseUrl()}/storage/v1/object/public/avatars/${user.id}/`;
      if (!data.photoUrl.startsWith(prefix)) return { ok: false, error: "Foto inválida" };
    }
    let avatarId = data.avatarId;
    if (avatarId) {
      const { data: preset } = await supabase.from("avatars").select("id").eq("id", avatarId).maybeSingle();
      if (!preset) avatarId = null;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        avatar_id: avatarId,
        avatar_config: data.avatar,
        photo_url: data.photoUrl,
      })
      .eq("id", user.id);
    if (error) return { ok: false, error: "Não foi possível salvar o personagem" };
    revalidatePath("/escritorio", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    return { ok: false, error: "Erro inesperado ao salvar" };
  }
}
