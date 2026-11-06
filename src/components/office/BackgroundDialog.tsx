"use client";

import { Ban, Check, Droplets, ImagePlus, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type BackgroundEffect,
  imageFor,
  loadCustomImage,
  prepareCustomImage,
  PRESETS,
  presetsAvailable,
  saveCustomImage,
} from "@/lib/media/backgrounds";
import type { VideoTile } from "@/lib/media/useMedia";
import { TrackVideo } from "./VideoTiles";

interface Props {
  effect: BackgroundEffect;
  camOn: boolean;
  localCam: VideoTile | null;
  onChange: (e: BackgroundEffect) => Promise<void>;
  onTurnOnCam: () => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

const same = (a: BackgroundEffect, b: BackgroundEffect) => JSON.stringify(a) === JSON.stringify(b);

/** Escolha do fundo da câmera: nenhum, desfoque ou imagem (pronta ou enviada). */
export function BackgroundDialog({ effect, camOn, localCam, onChange, onTurnOnCam, onClose, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [thumbs] = useState(() => Object.fromEntries(PRESETS.map((p) => [p.id, imageFor(p.id) ?? ""])));
  const [custom, setCustom] = useState<string | null>(() => loadCustomImage());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = async (e: BackgroundEffect) => {
    setBusy(true);
    await onChange(e);
    setBusy(false);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await prepareCustomImage(file);
      if (!saveCustomImage(data)) {
        onError("Não consegui guardar a imagem neste navegador. Tente uma imagem menor.");
        return;
      }
      setCustom(data);
      await pick({ mode: "image", id: "personalizado" });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível usar essa imagem.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Efeitos de fundo"
        className="panel-in flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)] shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="font-semibold text-white">Efeitos de fundo</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-xl bg-black">
            {localCam ? (
              <TrackVideo tile={localCam} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center p-4 text-center text-sm text-[var(--muted)]">
                <div className="flex flex-col items-center gap-3">
                  <span>{camOn ? "Abrindo a câmera…" : "Ligue a câmera para ver a prévia."}</span>
                  {!camOn && (
                    <button type="button" onClick={onTurnOnCam} className="btn-primary h-9 px-4 text-sm">
                      <Video size={15} /> Ligar câmera
                    </button>
                  )}
                </div>
              </div>
            )}
            {busy && <div className="absolute inset-0 grid place-items-center bg-black/40 text-sm text-white">Aplicando…</div>}
          </div>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">Desfoque</h3>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={same(effect, { mode: "none" })} disabled={busy} label="Sem efeito" onPick={() => void pick({ mode: "none" })}>
                <div className="grid h-full place-items-center text-[var(--muted)]"><Ban size={22} /></div>
              </OptionCard>
              <OptionCard selected={same(effect, { mode: "blur", strength: "light" })} disabled={busy} label="Desfoque leve" onPick={() => void pick({ mode: "blur", strength: "light" })}>
                <div className="grid h-full place-items-center text-[var(--muted)]"><Droplets size={20} /></div>
              </OptionCard>
              <OptionCard selected={same(effect, { mode: "blur", strength: "strong" })} disabled={busy} label="Desfoque forte" onPick={() => void pick({ mode: "blur", strength: "strong" })}>
                <div className="grid h-full place-items-center text-white"><Droplets size={26} /></div>
              </OptionCard>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">Fundos</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(presetsAvailable() ? PRESETS : []).map((p) => (
                <OptionCard key={p.id} selected={same(effect, { mode: "image", id: p.id })} disabled={busy} label={p.label} onPick={() => void pick({ mode: "image", id: p.id })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada localmente (data URL) */}
                  <img src={thumbs[p.id]} alt="" className="h-full w-full object-cover" />
                </OptionCard>
              ))}
              {custom && (
                <OptionCard selected={same(effect, { mode: "image", id: "personalizado" })} disabled={busy} label="Minha imagem" onPick={() => void pick({ mode: "image", id: "personalizado" })}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem do próprio usuário (data URL) */}
                  <img src={custom} alt="" className="h-full w-full object-cover" />
                </OptionCard>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex aspect-video flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/15 text-xs text-[var(--muted)] hover:border-white/30 hover:text-white"
              >
                <ImagePlus size={20} />
                {custom ? "Trocar minha imagem" : "Enviar imagem"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(ev) => {
                  void upload(ev.target.files?.[0]);
                  ev.target.value = "";
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              O efeito é feito no seu computador e vale em todas as salas. Sua imagem fica salva só neste navegador.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  selected,
  disabled,
  label,
  onPick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition disabled:opacity-60 ${selected ? "border-[var(--amber)]" : "border-white/10 hover:border-white/30"}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[var(--panel-2)]">{children}</div>
      <span className="truncate px-2 py-1.5 text-xs text-white">{label}</span>
      {selected && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--amber)] text-white">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}
