import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OfficeClient } from "@/components/office/OfficeClient";
import { isOfficeManager, requireUser } from "@/lib/auth";
import { parseAvatar } from "@/lib/avatar";
import { mediaProvider } from "@/lib/env";
import { layoutSpecFor } from "@/lib/office-layout";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Office, Room, RoomInfo, UserSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Escritório" };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/escritorio/${slug}`;
  const { user, profile, supabase } = await requireUser(path);
  if (!profile.avatar_config) redirect(`/personagem?next=${encodeURIComponent(path)}`);

  const { data: officeRow } = await supabase.from("offices").select("*").eq("slug", slug).maybeSingle();
  if (!officeRow) notFound();
  const office = officeRow as Office;

  // Sede privada: só membros entram (o administrador da plataforma entra em qualquer uma).
  let { data: member } = await supabase
    .from("office_members")
    .select("role, banned")
    .eq("office_id", office.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member && profile.role === "admin") {
    const { data } = await supabase
      .from("office_members")
      .insert({ office_id: office.id, user_id: user.id, role: "member" })
      .select("role, banned")
      .single();
    member = data;
  }
  if (!member) redirect("/escritorio?erro=sem-acesso");
  if (member.banned) redirect("/escritorio?erro=banido");

  const [{ data: rooms }, { data: invites }, { data: settingsRow }, manager] = await Promise.all([
    supabase.from("rooms").select("*").eq("office_id", office.id).order("name"),
    supabase.from("room_members").select("room_id").eq("user_id", user.id),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    isOfficeManager(supabase, office.id),
  ]);
  const invited = new Set((invites ?? []).map((i) => i.room_id as string));
  const roomInfos: RoomInfo[] = ((rooms ?? []) as Room[]).map((r) => ({
    id: r.id,
    zoneKey: r.zone_key,
    name: r.name,
    capacity: r.capacity,
    isPrivate: r.is_private,
    canAccess: manager || !r.is_private || invited.has(r.id),
    lockedBy: ((r as unknown as { locked_by?: string | null }).locked_by ?? null) || null,
    theme: r.theme || null,
    logoUrl: r.logo_url || null,
  }));
  const layout = layoutSpecFor(office.layout, (rooms ?? []) as Room[]);
  const provider = mediaProvider(office.slug);

  // Mesas fixas (nome de quem é dono de cada mesa). Lido com a chave do servidor:
  // a pessoa já foi validada como membro acima.
  const admin = supabaseAdmin();
  const { data: deskRows } = await admin
    .from("office_members")
    .select("user_id, desk")
    .eq("office_id", office.id)
    .not("desk", "is", null);
  const deskUserIds = (deskRows ?? []).map((d) => d.user_id as string);
  const { data: deskProfiles } = deskUserIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", deskUserIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((deskProfiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const desks = (deskRows ?? []).map((d) => ({
    index: d.desk as number,
    userId: d.user_id as string,
    name: nameOf.get(d.user_id as string) ?? "Alguém",
  }));

  const settings: UserSettings = {
    user_id: user.id,
    mic_on_join: false,
    cam_on_join: false,
    audio_input_id: null,
    video_input_id: null,
    audio_output_id: null,
    master_volume: 1,
    show_names: true,
    ...((settingsRow as Partial<UserSettings> | null) ?? {}),
  };

  return (
    <OfficeClient
      // Mudou a estrutura (salas, mesas, lazer): recria o jogo com o mapa novo.
      key={`${office.id}:${provider}:${JSON.stringify(layout)}`}
      layout={layout}
      office={{
        id: office.id,
        slug: office.slug,
        name: office.name,
        proximityRadius: office.proximity_radius,
        proximityMode: office.proximity_mode,
        maxOnline: office.max_online,
        // Cadastro fechado: a equipe entra pelas contas criadas no painel (sem link de convite).
        inviteCode: null,
        logoUrl: office.logo_url || null,
        brandBackgrounds: office.slug === "sede",
        mediaProvider: provider,
      }}
      rooms={roomInfos}
      desks={desks}
      me={{
        id: user.id,
        name: profile.display_name,
        avatar: parseAvatar(profile.avatar_config),
        isAdmin: profile.role === "admin",
        isManager: manager,
      }}
      settings={settings}
    />
  );
}
