import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/auth";
import type { Office, Room } from "@/lib/types";

/**
 * Garante que o usuário é membro ativo do escritório (não banido).
 * Usa o cliente com sessão: a RLS também filtra.
 */
export async function assertOfficeMember(sb: SupabaseClient, officeId: string, userId: string) {
  const { data: office } = await sb.from("offices").select("*").eq("id", officeId).maybeSingle();
  if (!office) throw new HttpError(404, "Escritório não encontrado");
  const { data: member } = await sb
    .from("office_members")
    .select("role, banned")
    .eq("office_id", officeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new HttpError(403, "Você não é membro deste escritório");
  if (member.banned) throw new HttpError(403, "Seu acesso a este escritório foi removido");
  return { office: office as Office, role: member.role as string };
}

/** Garante acesso a uma sala de reunião (pública, convidado ou gestor). */
export async function assertRoomAccess(sb: SupabaseClient, officeId: string, roomId: string) {
  const { data: room } = await sb.from("rooms").select("*").eq("id", roomId).maybeSingle();
  if (!room || room.office_id !== officeId) throw new HttpError(404, "Sala não encontrada");
  const { data: ok } = await sb.rpc("can_access_room", { rid: roomId });
  if (ok !== true) throw new HttpError(403, "Sala privada: você não tem acesso");
  return room as Room;
}
