import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { CharacterCreator } from "@/components/character/CharacterCreator";
import { requireUser } from "@/lib/auth";
import { parseAvatar } from "@/lib/avatar";
import { safeNext } from "@/lib/safe-next";
import type { AvatarPreset } from "@/lib/types";

export const metadata: Metadata = { title: "Seu personagem" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const { user, profile, supabase } = await requireUser("/personagem");
  const { data: presets } = await supabase
    .from("avatars")
    .select("id, name, description, preset, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  return (
    <div className="min-h-dvh">
      <AppHeader profile={profile} />
      <main className="mx-auto max-w-6xl px-5 py-8">
        <CharacterCreator
          userId={user.id}
          next={next}
          isNew={!profile.avatar_config}
          initialName={profile.display_name}
          initialAvatar={profile.avatar_config ? parseAvatar(profile.avatar_config) : null}
          initialAvatarId={profile.avatar_id}
          initialPhoto={profile.photo_url}
          presets={((presets ?? []) as AvatarPreset[]).map((p) => ({ ...p, preset: parseAvatar(p.preset) }))}
        />
      </main>
    </div>
  );
}
