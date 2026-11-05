/**
 * Efeitos de fundo da câmera (desfoque e imagens), processados no navegador.
 * A escolha fica salva só no navegador de cada pessoa.
 */

import { drawFullScene } from "@/lib/game/art/environment";

export type BackgroundEffect =
  | { mode: "none" }
  | { mode: "blur"; strength: "light" | "strong" }
  | { mode: "image"; id: string };

export const BLUR_RADIUS = { light: 6, strong: 16 } as const;

const KEY = "fredy:fundo";
const CUSTOM_KEY = "fredy:fundo-personalizado";

export function loadEffect(): BackgroundEffect {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as BackgroundEffect | null;
    if (v?.mode === "blur" && (v.strength === "light" || v.strength === "strong")) return v;
    if (v?.mode === "image" && typeof v.id === "string") return v;
  } catch {
    /* sem armazenamento */
  }
  return { mode: "none" };
}

export function saveEffect(e: BackgroundEffect) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(e));
  } catch {
    /* ignora */
  }
}

export function loadCustomImage(): string | null {
  try {
    return window.localStorage.getItem(CUSTOM_KEY);
  } catch {
    return null;
  }
}

export function saveCustomImage(dataUrl: string): boolean {
  try {
    window.localStorage.setItem(CUSTOM_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

const W = 1280;
const H = 720;

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d")!] as const;
}

function brandFont(weight: number, px: number) {
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-poppins").trim() || "sans-serif";
  return `${weight} ${px}px ${fam}`;
}

function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, frColor: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = brandFont(800, px);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = frColor;
  ctx.fillText("Fr", x, y);
  const w = ctx.measureText("Fr").width;
  ctx.fillStyle = "#2b6af3";
  ctx.fillText("édy", x + w, y);
  ctx.restore();
}

/** Fundos prontos, gerados na hora (sem baixar imagens). */
export const PRESETS: { id: string; label: string; src?: string; draw?: () => string }[] = [
  { id: "parede-clara", label: "Parede clara", src: "/fundos/parede-clara.jpg" },
  { id: "parede-escura", label: "Parede escura", src: "/fundos/parede-escura.jpg" },
  {
    id: "fredy-azul",
    label: "Frédy azul",
    draw: () => {
      const [c, ctx] = canvas();
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0e1533");
      g.addColorStop(0.6, "#16245e");
      g.addColorStop(1, "#2b6af3");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(W * 0.85, H * 0.15, 120 + i * 70, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.stroke();
      }
      wordmark(ctx, 60, H - 60, 64, "#ffffff", 0.9);
      return c.toDataURL("image/jpeg", 0.9);
    },
  },
  {
    id: "fredy-claro",
    label: "Frédy claro",
    draw: () => {
      const [c, ctx] = canvas();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#f4f7ff");
      g.addColorStop(1, "#dfe8ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(43,106,243,0.08)";
      ctx.beginPath();
      ctx.arc(W * 0.9, H * 0.9, 380, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(26,33,64,0.05)";
      ctx.beginPath();
      ctx.arc(W * 0.05, H * 0.1, 260, 0, Math.PI * 2);
      ctx.fill();
      wordmark(ctx, W - 300, 100, 64, "#1a2140", 0.95);
      return c.toDataURL("image/jpeg", 0.9);
    },
  },
  {
    id: "escritorio",
    label: "Escritório",
    draw: () => {
      // Recorte da Sala Principal do próprio mapa, ampliado em pixel art.
      const [c, ctx] = canvas();
      const scene = drawFullScene();
      ctx.imageSmoothingEnabled = false;
      // Área ~ 14×7,9 tiles (16:9) a partir do canto da Sala Principal.
      ctx.drawImage(scene, 0, 0, 448, 252, 0, 0, W, H);
      ctx.fillStyle = "rgba(14,21,51,0.25)";
      ctx.fillRect(0, 0, W, H);
      return c.toDataURL("image/jpeg", 0.9);
    },
  },
  {
    id: "noite",
    label: "Noite",
    draw: () => {
      const [c, ctx] = canvas();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#070b1f");
      g.addColorStop(1, "#1a2552");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`;
        const s = rnd() < 0.85 ? 2 : 4;
        ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.8), s, s);
      }
      ctx.fillStyle = "#0b1029";
      for (let x = 0; x < W; x += 80) {
        const h = 120 + Math.floor(rnd() * 200);
        ctx.fillRect(x, H - h, 72, h);
        ctx.fillStyle = "rgba(255,214,120,0.6)";
        for (let wy = H - h + 16; wy < H - 10; wy += 22)
          for (let wx = x + 10; wx < x + 64; wx += 18) if (rnd() < 0.35) ctx.fillRect(wx, wy, 8, 10);
        ctx.fillStyle = "#0b1029";
      }
      return c.toDataURL("image/jpeg", 0.9);
    },
  },
];

const cache = new Map<string, string>();

/** URL (data:) da imagem de um fundo, gerando e guardando em cache. */
export function imageFor(id: string): string | null {
  if (id === "personalizado") return loadCustomImage();
  const hit = cache.get(id);
  if (hit) return hit;
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return null;
  if (p.src) return p.src;
  if (!p.draw) return null;
  const url = p.draw();
  cache.set(id, url);
  return url;
}

/** Reduz a foto enviada para 1280×720 (cobre o quadro) e devolve JPEG em data URL. */
export async function prepareCustomImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 15 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const [c, ctx] = canvas();
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
