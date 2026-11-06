/** Identidades visuais das salas (placa na porta + banner com a logo dentro). */

export const ROOM_THEMES = {
  tete: { label: "Tete à tete", bg: 0x00e074, fg: "#0b0b0b", accent: 0x0b0b0b, logo: "/marcas/tete.png" },
  fredy: { label: "Frédy", bg: 0x1a2a6c, fg: "#ffffff", accent: 0x2b9bf3, logo: "/marcas/fredy.png" },
  duda: { label: "Duda", bg: 0x111111, fg: "#ffffff", accent: 0xff5a1f, logo: "/marcas/duda.png" },
  financeiro: { label: "Financeiro", bg: 0x0d3b2a, fg: "#00e074", accent: 0x00e074, logo: "/marcas/financeiro.png" },
} as const;

export type RoomTheme = keyof typeof ROOM_THEMES;
export const ROOM_THEME_KEYS = Object.keys(ROOM_THEMES) as RoomTheme[];
export const isRoomTheme = (v: unknown): v is RoomTheme => typeof v === "string" && v in ROOM_THEMES;

/** Placa sem identidade (cores do escritório). */
export const PLAIN_PLATE = { bg: 0x131c42, fg: "#ffffff", accent: 0x2b6af3 };
