import { z } from "zod";

/** Paletas permitidas. Mantidas fechadas para validar no servidor. */
export const SKIN_TONES = ["#f6d3b3", "#e8b48f", "#c98e64", "#a26a43", "#7a4a2c", "#4f2f1d"] as const;
export const HAIR_COLORS = ["#1f1a17", "#4a2e1c", "#8a5a2b", "#d9a65b", "#b8452f", "#9aa0a6", "#e9e4da", "#5b6ee1", "#c06cc6"] as const;
export const OUTFIT_COLORS = [
  "#2f6fde", "#1f9d8a", "#e0564c", "#f0a83a", "#8b5cf6", "#3a3f4b", "#f1efe9", "#d9467a", "#5aa34a", "#0f766e", "#7c4a2d", "#64748b",
] as const;
export const PANTS_COLORS = ["#2b3445", "#3d4a5c", "#1e293b", "#5c4033", "#4b5563", "#7c6f64", "#1f3a5f", "#e5e0d5"] as const;

export const HAIR_STYLES = ["curto", "medio", "longo", "coque", "cacheado", "raspado", "moicano", "rabo"] as const;
export const BODY_STYLES = ["camiseta", "moletom", "camisa", "jaqueta", "vestido"] as const;
export const ACCESSORIES = ["nenhum", "oculos", "fone", "bone", "gorro"] as const;

export const HAIR_STYLE_LABEL: Record<(typeof HAIR_STYLES)[number], string> = {
  curto: "Curto",
  medio: "Médio",
  longo: "Longo",
  coque: "Coque",
  cacheado: "Cacheado",
  raspado: "Raspado",
  moicano: "Moicano",
  rabo: "Rabo de cavalo",
};
export const BODY_STYLE_LABEL: Record<(typeof BODY_STYLES)[number], string> = {
  camiseta: "Camiseta",
  moletom: "Moletom",
  camisa: "Camisa social",
  jaqueta: "Jaqueta",
  vestido: "Vestido",
};
export const ACCESSORY_LABEL: Record<(typeof ACCESSORIES)[number], string> = {
  nenhum: "Nenhum",
  oculos: "Óculos",
  fone: "Headset",
  bone: "Boné",
  gorro: "Gorro",
};

export const avatarConfigSchema = z.object({
  base: z.string().min(1).max(40),
  skin: z.enum(SKIN_TONES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  body: z.enum(BODY_STYLES),
  outfit: z.enum(OUTFIT_COLORS),
  pants: z.enum(PANTS_COLORS),
  accessory: z.enum(ACCESSORIES),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  base: "dev",
  skin: "#e8b48f",
  hairStyle: "curto",
  hairColor: "#4a2e1c",
  body: "moletom",
  outfit: "#2f6fde",
  pants: "#2b3445",
  accessory: "nenhum",
};

/** Lê um JSON qualquer (vindo do banco ou da presença) com segurança. */
export function parseAvatar(input: unknown): AvatarConfig {
  const r = avatarConfigSchema.safeParse(input);
  return r.success ? r.data : DEFAULT_AVATAR;
}

export function avatarKey(a: AvatarConfig): string {
  return [a.skin, a.hairStyle, a.hairColor, a.body, a.outfit, a.pants, a.accessory].join("|");
}
