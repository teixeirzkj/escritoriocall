"use client";

import { useState } from "react";
import { HEX_COLOR, isRoomTheme, ROOM_THEME_KEYS, ROOM_THEMES, themeColor } from "@/lib/brand";

/** Cor da sala: identidade pronta, cor livre ou nenhuma. Envia theme_preset + theme_color. */
export function ThemePicker({ value }: { value: string | null }) {
  const initial = isRoomTheme(value) ? value : value && HEX_COLOR.test(value) ? "custom" : "";
  const [preset, setPreset] = useState<string>(initial);
  const [color, setColor] = useState(themeColor(value));
  return (
    <div className="flex items-center gap-2">
      <select name="theme_preset" value={preset} onChange={(e) => setPreset(e.target.value)} className="input h-10 min-w-0 flex-1 text-sm">
        <option value="">Sem cor (padrão)</option>
        <option value="custom">Cor personalizada…</option>
        {ROOM_THEME_KEYS.map((k) => (
          <option key={k} value={k}>{ROOM_THEMES[k].label}</option>
        ))}
      </select>
      <input
        type="color"
        name="theme_color"
        value={preset === "custom" ? color : themeColor(preset || null)}
        onChange={(e) => {
          setColor(e.target.value);
          setPreset("custom");
        }}
        aria-label="Cor da sala"
        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
      />
    </div>
  );
}
