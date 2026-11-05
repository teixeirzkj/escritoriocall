/**
 * Gerador procedural de spritesheets de personagem (pixel art).
 * Cada quadro tem 16×22 pixels lógicos, ampliados 2× (32×44 px).
 * Layout da folha: 4 linhas (baixo, esquerda, direita, cima) × 3 colunas
 * (parado, passo A, passo B).
 */
import type { AvatarConfig } from "@/lib/avatar";
import { ctx2d, makeCanvas, shade, type Ctx } from "./util";

export const CHAR_LW = 16;
export const CHAR_LH = 23;
export const CHAR_SCALE = 2;
export const CHAR_W = CHAR_LW * CHAR_SCALE;
export const CHAR_H = CHAR_LH * CHAR_SCALE;
export const DIRS = ["down", "left", "right", "up"] as const;
export type Dir = (typeof DIRS)[number];

const EYE = "#241a17";
const SHOE = "#2a2833";
const OUTLINE_RGB = [28, 24, 36];

type R = (x: number, y: number, w: number, h: number, c: string) => void;

function painter(ctx: Ctx): R {
  return (x, y, w, h, c) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
}

/** Cabeça (sem cabelo) para a vista frontal/traseira/lateral. */
function head(r: R, cfg: AvatarConfig, view: "down" | "side" | "up") {
  const skin = cfg.skin;
  const skinDark = shade(skin, -0.18);
  r(4, 3, 8, 6, skin);
  r(5, 2, 6, 1, skin);
  r(5, 9, 6, 1, skin);
  r(4, 8, 8, 1, skinDark); // sombra do queixo
  r(5, 9, 6, 1, skinDark);
  if (view === "down") {
    r(6, 6, 1, 2, EYE);
    r(9, 6, 1, 2, EYE);
    r(5, 8, 1, 1, shade(skin, -0.08));
    r(10, 8, 1, 1, shade(skin, -0.08));
  } else if (view === "side") {
    r(5, 6, 1, 2, EYE);
    r(3, 6, 1, 2, skin); // nariz
  }
  // pescoço
  r(7, 10, 2, 1, skinDark);
}

function hair(r: R, cfg: AvatarConfig, view: "down" | "side" | "up") {
  const c = cfg.hairColor;
  const hl = shade(c, 0.22);
  const dk = shade(c, -0.25);
  const style = cfg.hairStyle;

  if (style === "raspado") {
    const stub = shade(c, 0.15);
    r(5, 2, 6, 1, stub);
    r(4, 3, 8, 1, stub);
    if (view === "up") r(4, 3, 8, 5, stub);
    if (view === "side") r(9, 3, 3, 3, stub);
    return;
  }

  // Base: topo da cabeça
  const capTop = style === "cacheado" ? 1 : 1;
  r(5, capTop, 6, 1, c);
  r(4, capTop + 1, 8, 2, c);
  r(5, capTop, 4, 1, hl);

  if (style === "moicano") {
    r(4, 2, 8, 2, shade(c, 0.35));
    r(7, 0, 2, 4, c);
    r(7, 0, 1, 3, hl);
    if (view === "up") r(7, 0, 2, 8, c);
    return;
  }

  if (view === "down") {
    // franja
    r(4, 3, 8, 1, c);
    r(4, 4, 1, 2, c);
    r(11, 4, 1, 2, c);
    if (style === "curto" || style === "rabo") {
      r(5, 4, 2, 1, dk);
    }
    if (style === "medio" || style === "coque") {
      r(4, 4, 1, 4, c);
      r(11, 4, 1, 4, c);
      r(5, 4, 3, 1, c);
    }
    if (style === "longo") {
      r(3, 3, 2, 10, c);
      r(11, 3, 2, 10, c);
      r(5, 4, 2, 1, c);
      r(3, 12, 2, 1, dk);
      r(11, 12, 2, 1, dk);
    }
    if (style === "cacheado") {
      r(3, 1, 10, 4, c);
      r(2, 3, 2, 5, c);
      r(12, 3, 2, 5, c);
      r(4, 0, 3, 1, c);
      r(9, 0, 3, 1, c);
      r(4, 1, 2, 1, hl);
      r(10, 2, 2, 1, hl);
      r(2, 7, 1, 1, dk);
      r(13, 7, 1, 1, dk);
    }
  } else if (view === "side") {
    // virado para a esquerda: nuca à direita
    r(4, 3, 3, 1, c);
    r(8, 3, 4, 4, c);
    r(10, 6, 2, 2, c);
    if (style === "medio" || style === "coque") r(9, 3, 3, 6, c);
    if (style === "longo") {
      r(8, 3, 4, 6, c);
      r(9, 9, 4, 4, c);
      r(9, 12, 4, 1, dk);
    }
    if (style === "cacheado") {
      r(3, 1, 10, 3, c);
      r(7, 3, 6, 5, c);
      r(4, 0, 6, 1, c);
      r(5, 1, 2, 1, hl);
    }
    if (style === "rabo") {
      r(12, 5, 2, 2, c);
      r(13, 7, 1, 4, c);
    }
  } else {
    // costas: cabelo cobre a cabeça
    r(4, 3, 8, 5, c);
    r(5, 8, 6, 1, dk);
    if (style === "medio" || style === "coque") r(4, 3, 8, 6, c);
    if (style === "longo") {
      r(3, 3, 10, 10, c);
      r(3, 12, 10, 1, dk);
    }
    if (style === "cacheado") {
      r(2, 1, 12, 8, c);
      r(4, 0, 8, 1, c);
      r(5, 2, 2, 1, hl);
    }
    if (style === "rabo") {
      r(7, 8, 2, 5, c);
      r(7, 12, 2, 1, dk);
    }
  }

  if (style === "coque") {
    r(6, -1 + 0, 4, 2, c);
    r(7, -1 + 0, 2, 1, hl);
  }
}

function accessory(r: R, cfg: AvatarConfig, view: "down" | "side" | "up") {
  const a = cfg.accessory;
  if (a === "nenhum") return;
  if (a === "oculos") {
    if (view === "down") {
      r(5, 6, 6, 1, "#1d1d24");
      r(5, 6, 2, 2, "#1d1d24");
      r(9, 6, 2, 2, "#1d1d24");
      r(6, 7, 1, 1, "#9fd3ff");
      r(9, 7, 1, 1, "#9fd3ff");
    } else if (view === "side") {
      r(4, 6, 3, 1, "#1d1d24");
      r(4, 7, 1, 1, "#9fd3ff");
    }
    return;
  }
  if (a === "fone") {
    const band = "#1f2129";
    const cup = "#3b3f4c";
    r(4, 1, 8, 1, band);
    if (view === "side") {
      r(7, 1, 2, 5, band);
      r(7, 5, 3, 3, cup);
      r(4, 8, 4, 1, band);
      r(3, 8, 1, 1, "#e0564c");
    } else {
      r(3, 2, 1, 4, band);
      r(12, 2, 1, 4, band);
      r(2, 5, 2, 3, cup);
      r(12, 5, 2, 3, cup);
      if (view === "down") {
        r(4, 8, 2, 1, band);
        r(6, 8, 1, 1, "#e0564c");
      }
    }
    return;
  }
  if (a === "bone") {
    const cap = cfg.outfit;
    r(4, 1, 8, 3, cap);
    r(5, 0, 6, 1, cap);
    r(5, 1, 3, 1, shade(cap, 0.25));
    if (view === "down") r(3, 4, 10, 1, shade(cap, -0.3));
    if (view === "side") r(1, 3, 5, 1, shade(cap, -0.3));
    if (view === "up") r(5, 4, 6, 1, shade(cap, -0.2));
    return;
  }
  if (a === "gorro") {
    const k = shade(cfg.outfit, 0.15);
    r(4, 0, 8, 4, k);
    r(5, -1 + 0, 6, 1, k);
    r(4, 3, 8, 1, shade(k, -0.25));
    r(5, 1, 1, 2, shade(k, 0.25));
    r(8, 1, 1, 2, shade(k, 0.25));
  }
}

/** Tronco, braços e pernas. frame: 0 parado, 1 passo A, 2 passo B. */
function body(r: R, cfg: AvatarConfig, view: "down" | "side" | "up", frame: number) {
  const top = cfg.outfit;
  const topDk = shade(top, -0.22);
  const topHl = shade(top, 0.18);
  const pants = cfg.pants;
  const pantsDk = shade(pants, -0.25);
  const skin = cfg.skin;
  const style = cfg.body;
  const longSleeve = style !== "camiseta" && style !== "vestido";
  const sleeve = longSleeve ? top : skin;
  const dress = style === "vestido";

  if (view === "side") {
    // pernas
    const legTop = dress ? 17 : 16;
    if (frame === 0) {
      r(6, legTop, 4, 19 - legTop, dress ? skin : pants);
      r(5, 19, 5, 2, SHOE);
    } else {
      const fwd = frame === 1;
      const front = dress ? skin : fwd ? pants : pantsDk;
      const back = dress ? shade(skin, -0.15) : fwd ? pantsDk : pants;
      r(9, legTop, 3, 19 - legTop, back);
      r(9, 19, 3, 2, SHOE);
      r(4, legTop, 3, 19 - legTop, front);
      r(3, 19, 4, 2, SHOE);
    }
    // tronco
    r(5, 11, 6, 5, top);
    r(5, 11, 6, 1, topHl);
    r(10, 11, 1, 5, topDk);
    if (dress) {
      r(4, 15, 8, 3, top);
      r(4, 17, 8, 1, topDk);
    } else {
      r(5, 15, 6, 1, pantsDk); // cinto
    }
    if (style === "moletom") r(9, 10, 3, 2, topDk); // capuz
    if (style === "jaqueta") r(5, 11, 1, 5, shade(top, -0.35));
    if (style === "camisa") r(5, 10, 3, 1, "#f4f2ee");
    // braço
    const ax = frame === 1 ? 6 : frame === 2 ? 8 : 7;
    r(ax, 11, 2, 4, sleeve);
    r(ax, 11, 2, 1, longSleeve ? topHl : skin);
    r(ax, 15, 2, 1, skin);
    return;
  }

  // Vista frontal / costas
  const lA = frame === 1 ? 1 : frame === 2 ? -1 : 0; // deslocamento perna esquerda
  const legTop = dress ? 17 : 16;
  const legColor = dress ? skin : pants;
  const legH = (d: number) => 19 - legTop + d;
  // perna esquerda (x5..7) e direita (x8..10)
  r(5, legTop, 3, legH(lA > 0 ? 1 : lA < 0 ? -1 : 0), legColor);
  r(8, legTop, 3, legH(lA < 0 ? 1 : lA > 0 ? -1 : 0), legColor);
  if (!dress) r(7, legTop, 1, 3, pantsDk);
  r(5, 19 + (lA > 0 ? 1 : lA < 0 ? -1 : 0), 3, 2, SHOE);
  r(8, 19 + (lA < 0 ? 1 : lA > 0 ? -1 : 0), 3, 2, SHOE);

  // tronco
  r(4, 11, 8, 5, top);
  r(4, 11, 8, 1, topHl);
  r(4, 15, 8, 1, dress ? top : pantsDk);
  if (dress) {
    r(3, 15, 10, 3, top);
    r(3, 17, 10, 1, topDk);
  }
  if (view === "down") {
    if (style === "camisa") {
      r(6, 11, 4, 1, "#f4f2ee");
      r(7, 12, 2, 1, "#f4f2ee");
      r(8, 13, 1, 1, topDk);
      r(8, 14, 1, 1, topDk);
    }
    if (style === "jaqueta") {
      r(7, 11, 2, 4, "#eceae4");
      r(6, 11, 1, 4, topDk);
      r(9, 11, 1, 4, topDk);
    }
    if (style === "moletom") {
      r(5, 11, 6, 1, topDk);
      r(6, 13, 4, 2, topDk);
      r(7, 12, 1, 1, "#e9e6df");
      r(8, 12, 1, 1, "#e9e6df");
    }
    if (style === "camiseta") r(6, 11, 4, 1, topDk);
  } else {
    if (style === "moletom") {
      r(5, 10, 6, 2, topDk);
    }
    r(4, 14, 8, 1, topDk);
  }
  // braços com balanço
  const aL = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  r(3, 11 + Math.max(0, aL), 1, 4, sleeve);
  r(12, 11 + Math.max(0, -aL), 1, 4, sleeve);
  r(3, 15 + Math.max(0, aL), 1, 1, skin);
  r(12, 15 + Math.max(0, -aL), 1, 1, skin);
  if (longSleeve) {
    r(3, 11 + Math.max(0, aL), 1, 1, topHl);
    r(12, 11 + Math.max(0, -aL), 1, 1, topHl);
  }
}

function paintFrame(ctx: Ctx, cfg: AvatarConfig, dir: Dir, frame: number) {
  const r = painter(ctx);
  // A camada de cabelo pode usar y = −1 (coque/gorro): desloca tudo 1px para baixo.
  ctx.save();
  ctx.translate(0, 1);
  const view = dir === "down" ? "down" : dir === "up" ? "up" : "side";
  if (view === "up") {
    // cabelo longo/rabo aparece sobre as costas: desenha corpo primeiro
    body(r, cfg, view, frame);
    head(r, cfg, view);
    hair(r, cfg, view);
    accessory(r, cfg, view);
  } else {
    body(r, cfg, view, frame);
    if (cfg.hairStyle === "longo" && view === "down") {
      // cabelo longo atrás dos ombros
      r(3, 9, 2, 4, cfg.hairColor);
      r(11, 9, 2, 4, cfg.hairColor);
    }
    head(r, cfg, view);
    hair(r, cfg, view);
    accessory(r, cfg, view);
  }
  ctx.restore();
}

/** Adiciona contorno escuro de 1px ao redor da silhueta. */
function outline(ctx: Ctx, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 0) continue;
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (d[(ny * w + nx) * 4 + 3] > 200) {
          near = true;
          break;
        }
      }
      if (near) {
        out[i] = OUTLINE_RGB[0];
        out[i + 1] = OUTLINE_RGB[1];
        out[i + 2] = OUTLINE_RGB[2];
        out[i + 3] = 235;
      }
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

function paintLogicalFrame(cfg: AvatarConfig, dir: Dir, frame: number): HTMLCanvasElement {
  const c = makeCanvas(CHAR_LW, CHAR_LH);
  const ctx = ctx2d(c);
  if (dir === "right") {
    ctx.save();
    ctx.translate(CHAR_LW, 0);
    ctx.scale(-1, 1);
    paintFrame(ctx, cfg, "left", frame);
    ctx.restore();
  } else {
    paintFrame(ctx, cfg, dir, frame);
  }
  outline(ctx, CHAR_LW, CHAR_LH);
  return c;
}

/**
 * Gera a folha completa: 3 colunas × 4 linhas, cada quadro CHAR_W×CHAR_H.
 * Inclui sombra elíptica no chão.
 */
export function drawCharacterSheet(cfg: AvatarConfig): HTMLCanvasElement {
  const sheet = makeCanvas(CHAR_W * 3, CHAR_H * 4);
  const ctx = ctx2d(sheet);
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) {
      const ox = f * CHAR_W;
      const oy = row * CHAR_H;
      // sombra
      ctx.fillStyle = "rgba(20,16,30,0.28)";
      ctx.beginPath();
      ctx.ellipse(ox + CHAR_W / 2, oy + CHAR_H - 3, 11, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const frame = paintLogicalFrame(cfg, dir, f);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame, 0, 0, CHAR_LW, CHAR_LH, ox, oy, CHAR_W, CHAR_H);
    }
  });
  return sheet;
}

/** Posição do quadro na folha. */
export function frameRect(dir: Dir, frame: number) {
  const row = DIRS.indexOf(dir);
  return { x: frame * CHAR_W, y: row * CHAR_H, w: CHAR_W, h: CHAR_H };
}
