/** Identidades visuais das salas: cor do piso, placa na porta e logo na TV. */

export const ROOM_THEMES = {
  // Setor TAT (Tete à tete): cinza com detalhe verde.
  tete: {
    label: "Tete à tete (cinza)",
    bg: 0x2b2e35,
    fg: "#ffffff",
    accent: 0x00e074,
    logo: "/marcas/tete.png",
    floor: "#7a7e87",
    rug: { base: "#3d4048", border: "#00e074", inner: "#4a4e57" },
  },
  fredy: {
    label: "Frédy (azul)",
    bg: 0x1d3f9e,
    fg: "#ffffff",
    accent: 0x7fc0ff,
    logo: "/marcas/fredy.png",
    floor: "#3b63b8",
    rug: { base: "#1a2f78", border: "#9cd0ff", inner: "#24409a" },
  },
  duda: {
    label: "Duda (preto e laranja)",
    bg: 0x151515,
    fg: "#ffffff",
    accent: 0xff5a1f,
    logo: "/marcas/duda.png",
    floor: "#4a4a4d",
    rug: { base: "#1d1d1f", border: "#ff5a1f", inner: "#2a2a2d" },
  },
  financeiro: {
    label: "Financeiro (verde-escuro)",
    bg: 0x0f4a33,
    fg: "#ffffff",
    accent: 0x3ddc84,
    logo: "/marcas/financeiro.png",
    floor: "#2f6a4f",
    rug: { base: "#123f2d", border: "#3ddc84", inner: "#1a5039" },
  },
} as const;

export type RoomTheme = keyof typeof ROOM_THEMES;
export const ROOM_THEME_KEYS = Object.keys(ROOM_THEMES) as RoomTheme[];
export const isRoomTheme = (v: unknown): v is RoomTheme => typeof v === "string" && v in ROOM_THEMES;

/** Placa sem identidade (cores do escritório). */
export const PLAIN_PLATE = { bg: 0x131c42, fg: "#ffffff", accent: 0x2b6af3 };

/** Cor livre escolhida no painel (#rrggbb). */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;
export const isThemeValue = (v: unknown): v is string => isRoomTheme(v) || (typeof v === "string" && HEX_COLOR.test(v));

export interface RoomPalette {
  bg: number;
  fg: string;
  accent: number;
  floor: string;
  rug: { base: string; border: string; inner: string };
  logo: string | null;
}

function mix(hex: string, target: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}
const num = (hex: string) => parseInt(hex.slice(1), 16);

/** Cores da sala: identidade pronta, cor livre (derivada) ou null (sem identidade). */
export function roomPalette(theme: string | null | undefined): RoomPalette | null {
  if (isRoomTheme(theme)) return { ...ROOM_THEMES[theme] };
  if (typeof theme === "string" && HEX_COLOR.test(theme)) {
    return {
      bg: num(mix(theme, "#000000", 0.45)),
      fg: "#ffffff",
      accent: num(mix(theme, "#ffffff", 0.45)),
      floor: mix(theme, "#808080", 0.25),
      rug: { base: mix(theme, "#000000", 0.45), border: mix(theme, "#ffffff", 0.5), inner: mix(theme, "#000000", 0.3) },
      logo: null,
    };
  }
  return null;
}

/** Cor representativa (#rrggbb) de um tema, para os seletores do painel. */
export function themeColor(theme: string | null | undefined): string {
  if (isRoomTheme(theme)) return ROOM_THEMES[theme].floor;
  if (typeof theme === "string" && HEX_COLOR.test(theme)) return theme;
  return "#4b5d7a";
}
