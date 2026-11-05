import { LogOut, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { AvatarThumb } from "@/components/AvatarThumb";
import { Logo } from "@/components/Logo";
import { parseAvatar } from "@/lib/avatar";
import type { Profile } from "@/lib/types";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="border-b border-white/5 bg-[var(--bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Logo href="/escritorio" />
        <nav className="flex items-center gap-1 text-sm">
          {profile.role === "admin" && (
            <Link href="/admin" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[var(--muted)] hover:bg-white/5 hover:text-white">
              <Shield size={16} /> <span className="hidden sm:inline">Administração</span>
            </Link>
          )}
          <Link href="/personagem" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[var(--text)] hover:bg-white/5" title="Editar personagem">
            {profile.avatar_config ? (
              <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-[#1d2a5c]">
                <AvatarThumb avatar={parseAvatar(profile.avatar_config)} bust />
              </span>
            ) : (
              <UserRound size={18} />
            )}
            <span className="hidden max-w-32 truncate sm:inline">{profile.display_name}</span>
          </Link>
          <form action="/auth/sair" method="post">
            <button type="submit" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[var(--muted)] hover:bg-white/5 hover:text-white" title="Sair">
              <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
