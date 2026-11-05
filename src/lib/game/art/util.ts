/** Utilitários de pintura pixel art em canvas 2D (sem dependências). */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** amt > 0 clareia, amt < 0 escurece (−1..1). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return `rgb(${clamp(r + (t - r) * p)},${clamp(g + (t - g) * p)},${clamp(b + (t - b) * p)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Hash determinístico 0..1 para variações. */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/**
 * Pintor em "pixels lógicos": cada pixel lógico vira s×s pixels reais.
 * (ox, oy) é a origem em pixels reais.
 */
export class P {
  constructor(
    public ctx: Ctx,
    public ox = 0,
    public oy = 0,
    public s = 2,
  ) {}
  r(x: number, y: number, w: number, h: number, color: string) {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      Math.round(this.ox + x * this.s),
      Math.round(this.oy + y * this.s),
      Math.round(w * this.s),
      Math.round(h * this.s),
    );
  }
  px(x: number, y: number, color: string) {
    this.r(x, y, 1, 1, color);
  }
  /** Elipse preenchida em pixels lógicos. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x1 = Math.round(cx - half);
      const x2 = Math.round(cx + half);
      this.r(x1, y, x2 - x1, 1, color);
    }
  }
  /** Retângulo com contorno de 1px lógico. */
  box(x: number, y: number, w: number, h: number, fill: string, outline: string) {
    this.r(x, y, w, h, outline);
    this.r(x + 1, y + 1, w - 2, h - 2, fill);
  }
}

export const OUTLINE = "#231f2b";
