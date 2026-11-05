"use client";

import { Check, ImagePlus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCharacter } from "@/app/personagem/actions";
import { AvatarThumb } from "@/components/AvatarThumb";
import {
  ACCESSORIES,
  ACCESSORY_LABEL,
  type AvatarConfig,
  BODY_STYLE_LABEL,
  BODY_STYLES,
  DEFAULT_AVATAR,
  HAIR_COLORS,
  HAIR_STYLE_LABEL,
  HAIR_STYLES,
  OUTFIT_COLORS,
  PANTS_COLORS,
  SKIN_TONES,
} from "@/lib/avatar";
import type { Dir } from "@/lib/game/art/characters";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AvatarPreset } from "@/lib/types";

const DIR_ORDER: Dir[] = ["down", "left", "up", "right"];

interface Props {
  userId: string;
  next: string;
  isNew: boolean;
  initialName: string;
  initialAvatar: AvatarConfig | null;
  initialAvatarId: string | null;
  initialPhoto: string | null;
  presets: AvatarPreset[];
}

export function CharacterCreator(p: Props) {
  const router = useRouter();
  const [name, setName] = useState(p.initialName);
  const [avatar, setAvatar] = useState<AvatarConfig>(p.initialAvatar ?? p.presets[0]?.preset ?? DEFAULT_AVATAR);
  const [avatarId, setAvatarId] = useState<string | null>(p.initialAvatarId ?? p.presets[0]?.id ?? null);
  const [photo, setPhoto] = useState<string | null>(p.initialPhoto);
  const [dirIdx, setDirIdx] = useState(0);
  const [walking, setWalking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => setAvatar((a) => ({ ...a, [k]: v }));

  const uploadPhoto = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Use PNG, JPG ou WEBP.");
    if (file.size > 2 * 1024 * 1024) return setError("A imagem deve ter no máximo 2 MB.");
    setUploading(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const ext = file.type.split("/")[1];
      const path = `${p.userId}/foto-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      setPhoto(sb.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch {
      setError("Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveCharacter({ displayName: name, avatarId, avatar, photoUrl: photo });
      if (!res.ok) return setError(res.error);
      router.push(p.next);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      {/* Prévia */}
      <section className="lg:sticky lg:top-6 lg:self-start">
        <h1 className="font-pixel text-3xl text-white">{p.isNew ? "Monte seu personagem" : "Seu personagem"}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">É assim que as pessoas vão te ver no escritório.</p>
        <div className="card mt-6 overflow-hidden">
          <div
            className="relative grid h-80 place-items-center"
            style={{
              backgroundColor: "#b98457",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(0,0,0,0.09) 0 2px, transparent 2px 8px), repeating-linear-gradient(90deg, transparent 0 46px, rgba(0,0,0,0.08) 46px 48px)",
            }}
          >
            <div className="flex flex-col items-center">
              <span className="mb-2 max-w-56 truncate rounded bg-[var(--amber)] px-2 py-0.5 text-xs font-semibold text-white">
                {name.trim() || "Seu nome"}
              </span>
              <AvatarThumb avatar={avatar} scale={5} dir={DIR_ORDER[dirIdx]} walking={walking} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-white/10 p-3">
            <div className="flex gap-1">
              <IconBtn label="Girar para a esquerda" onClick={() => setDirIdx((i) => (i + 3) % 4)}><RotateCcw size={16} /></IconBtn>
              <IconBtn label="Girar para a direita" onClick={() => setDirIdx((i) => (i + 1) % 4)}><RotateCw size={16} /></IconBtn>
            </div>
            <button type="button" onClick={() => setWalking((w) => !w)} className="btn-ghost h-9 px-3 text-xs">
              {walking ? "Parar" : "Caminhar"}
            </button>
          </div>
        </div>
      </section>

      {/* Editor */}
      <section className="space-y-6">
        <div className="card p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-white">Nome de exibição</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="input h-11" placeholder="Como quer ser chamado(a)?" />
          </label>
          <p className="mt-1.5 text-xs text-[var(--muted)]">Aparece acima da cabeça do seu personagem. Entre 2 e 32 caracteres.</p>
        </div>

        {p.presets.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Escolha um estilo</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {p.presets.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => {
                    setAvatar(pr.preset);
                    setAvatarId(pr.id);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition ${avatarId === pr.id ? "border-[var(--amber)] bg-[var(--amber)]/10" : "border-white/10 hover:border-white/20 hover:bg-white/5"}`}
                  title={pr.description ?? pr.name}
                  aria-pressed={avatarId === pr.id}
                >
                  <AvatarThumb avatar={pr.preset} scale={1.5} />
                  <span className="text-xs text-[var(--text)]">{pr.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card space-y-5 p-5">
          <h2 className="text-sm font-semibold text-white">Aparência</h2>
          <Swatches label="Tom de pele" values={SKIN_TONES} value={avatar.skin} onChange={(v) => set("skin", v)} />
          <Chips label="Cabelo" values={HAIR_STYLES} labels={HAIR_STYLE_LABEL} value={avatar.hairStyle} onChange={(v) => set("hairStyle", v)} />
          <Swatches label="Cor do cabelo" values={HAIR_COLORS} value={avatar.hairColor} onChange={(v) => set("hairColor", v)} />
        </div>

        <div className="card space-y-5 p-5">
          <h2 className="text-sm font-semibold text-white">Roupa e acessórios</h2>
          <Chips label="Peça" values={BODY_STYLES} labels={BODY_STYLE_LABEL} value={avatar.body} onChange={(v) => set("body", v)} />
          <Swatches label="Cor da roupa" values={OUTFIT_COLORS} value={avatar.outfit} onChange={(v) => set("outfit", v)} />
          <Swatches label="Cor da calça" values={PANTS_COLORS} value={avatar.pants} onChange={(v) => set("pants", v)} />
          <Chips label="Acessório" values={ACCESSORIES} labels={ACCESSORY_LABEL} value={avatar.accessory} onChange={(v) => set("accessory", v)} />
        </div>

        <div className="card p-5">
          <h2 className="mb-1 text-sm font-semibold text-white">Foto de perfil <span className="font-normal text-[var(--muted)]">(opcional)</span></h2>
          <p className="mb-3 text-xs text-[var(--muted)]">Aparece no painel de administração e no seu perfil. PNG, JPG ou WEBP até 2 MB.</p>
          <div className="flex items-center gap-3">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Sua foto" className="h-14 w-14 rounded-xl object-cover" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/5 text-[var(--muted)]"><ImagePlus size={20} /></div>
            )}
            <label className="btn-ghost h-10 cursor-pointer px-4 text-sm">
              {uploading ? "Enviando…" : photo ? "Trocar foto" : "Enviar foto"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
            </label>
            {photo && (
              <button type="button" onClick={() => setPhoto(null)} className="btn-ghost h-10 px-3 text-sm" aria-label="Remover foto"><Trash2 size={15} /></button>
            )}
          </div>
        </div>

        {error && <div role="alert" className="rounded-xl border border-[var(--coral)]/40 bg-[var(--coral)]/10 px-3 py-2.5 text-sm text-[#ffb4ad]">{error}</div>}

        <div className="flex flex-wrap justify-end gap-3">
          {!p.isNew && <button type="button" onClick={() => router.back()} className="btn-ghost h-12 px-5">Cancelar</button>}
          <button type="button" onClick={save} disabled={pending || uploading} className="btn-primary h-12 px-6">
            <Check size={18} /> {pending ? "Salvando…" : p.isNew ? "Confirmar e entrar" : "Salvar personagem"}
          </button>
        </div>
      </section>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-[var(--text)] hover:bg-white/10">
      {children}
    </button>
  );
}

function Swatches<T extends string>({ label, values, value, onChange }: { label: string; values: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-[var(--muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`${label}: ${c}`}
            aria-pressed={value === c}
            className={`h-8 w-8 rounded-lg border-2 transition ${value === c ? "scale-110 border-white" : "border-black/30 hover:scale-105"}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Chips<T extends string>({ label, values, labels, value, onChange }: { label: string; values: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-[var(--muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${value === v ? "border-[var(--amber)] bg-[var(--amber)]/15 text-white" : "border-white/10 text-[var(--muted)] hover:border-white/20 hover:text-white"}`}
          >
            {labels[v]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
