"use client";

import { Room } from "livekit-client";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { setSoundsEnabled, soundsEnabled } from "@/lib/sounds";
import type { UserSettings } from "@/lib/types";

interface Props {
  settings: UserSettings;
  onClose: () => void;
  onSave: (s: UserSettings) => Promise<void>;
}

export function SettingsDialog({ settings, onClose, onSave }: Props) {
  const [s, setS] = useState(settings);
  const [devices, setDevices] = useState<{ audioinput: MediaDeviceInfo[]; videoinput: MediaDeviceInfo[]; audiooutput: MediaDeviceInfo[] }>({
    audioinput: [],
    videoinput: [],
    audiooutput: [],
  });
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sounds, setSounds] = useState(() => soundsEnabled());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, v, o] = await Promise.all([
          Room.getLocalDevices("audioinput", false),
          Room.getLocalDevices("videoinput", false),
          Room.getLocalDevices("audiooutput", false),
        ]);
        if (alive) setDevices({ audioinput: a, videoinput: v, audiooutput: o });
      } catch {
        if (alive) setDeviceError("Não foi possível listar os dispositivos. Permita o acesso ao microfone/câmera.");
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const sel = (kind: "audioinput" | "videoinput" | "audiooutput", key: "audio_input_id" | "video_input_id" | "audio_output_id", label: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      <select
        className="input h-10 text-sm"
        value={s[key] ?? ""}
        onChange={(e) => setS({ ...s, [key]: e.target.value || null })}
        disabled={devices[kind].length === 0}
      >
        <option value="">Padrão do sistema</option>
        {devices[kind].map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `Dispositivo ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="panel-in w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#131c42] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="settings-title" className="font-semibold text-white">Configurações</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">Dispositivos</h3>
            {deviceError && <p className="text-xs text-[#ff9b92]">{deviceError}</p>}
            {sel("audioinput", "audio_input_id", "Microfone")}
            {sel("videoinput", "video_input_id", "Câmera")}
            {devices.audiooutput.length > 0 && sel("audiooutput", "audio_output_id", "Saída de áudio")}
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">Áudio</h3>
            <label className="block">
              <span className="mb-1 flex justify-between text-xs font-medium text-[var(--muted)]">
                Volume geral <span className="tabular-nums">{Math.round(s.master_volume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.master_volume}
                onChange={(e) => setS({ ...s, master_volume: Number(e.target.value) })}
                className="w-full accent-[var(--amber)]"
              />
            </label>
            <Toggle checked={s.mic_on_join} onChange={(v) => setS({ ...s, mic_on_join: v })} label="Entrar com o microfone ligado" />
            <Toggle checked={s.cam_on_join} onChange={(v) => setS({ ...s, cam_on_join: v })} label="Entrar com a câmera ligada" />
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--amber)]">Exibição</h3>
            <Toggle checked={s.show_names} onChange={(v) => setS({ ...s, show_names: v })} label="Mostrar nomes acima dos personagens" />
            <Toggle checked={sounds} onChange={setSounds} label="Tocar som quando alguém entrar na sede ou na minha sala" />
            <Link href="/personagem?next=/escritorio" className="inline-block text-sm text-[var(--amber)] underline-offset-4 hover:underline">
              Editar meu personagem →
            </Link>
          </section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-ghost h-10 px-4 text-sm">Cancelar</button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSoundsEnabled(sounds);
              await onSave(s);
              setSaving(false);
            }}
            className="btn-primary h-10 px-5 text-sm"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-white">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[var(--amber)]" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
