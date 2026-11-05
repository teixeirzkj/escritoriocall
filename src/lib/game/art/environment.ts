/**
 * Pintura procedural do ambiente: pisos, paredes e mobiliário.
 * Tudo é desenhado em pixels lógicos de 2×2 px (1 tile = 16×16 lógicos).
 */
import {
  FLOOR,
  Floor,
  ITEM_DEFS,
  ITEMS,
  MAP_H,
  MAP_W,
  TILE,
  WORLD_H,
  WORLD_W,
  type ItemType,
  type MapItem,
} from "../map";
import { ctx2d, hash, makeCanvas, OUTLINE, P, shade, type Ctx } from "./util";

const S = 2; // tamanho do pixel lógico
const L = TILE / S; // 16 pixels lógicos por tile

// ---------------------------------------------------------------------------
// Pisos
// ---------------------------------------------------------------------------

const CARPETS: Partial<Record<Floor, string>> = {
  [Floor.CarpetBlue]: "#4b5d7a",
  [Floor.CarpetGreen]: "#5d7a63",
  [Floor.CarpetPlum]: "#76587a",
  [Floor.CarpetSand]: "#a08a6a",
  [Floor.CarpetTeal]: "#4f7c7a",
  [Floor.CarpetGame]: "#3b3f78",
};

function paintWood(p: P, tx: number, ty: number, base: string) {
  const gap = shade(base, -0.11);
  const light = shade(base, 0.06);
  p.r(0, 0, L, L, base);
  // 4 tábuas horizontais por tile; emendas contínuas entre tiles
  for (let i = 0; i < 4; i++) {
    const y = i * 4;
    const row = ty * 4 + i;
    const tone = hash(Math.floor((tx * 16 + (row % 3) * 8) / 24), row, 3);
    const plank = tone < 0.33 ? shade(base, -0.035) : tone > 0.7 ? light : base;
    p.r(0, y, L, 4, plank);
    p.r(0, y + 3, L, 1, gap);
    // emenda a cada 24 px lógicos (1,5 tile), deslocada por fileira
    for (let x = 0; x < L; x++) {
      if ((tx * L + x + (row % 3) * 8) % 24 === 0) p.r(x, y, 1, 3, gap);
    }
    if (hash(tx * 3 + i, ty, 11) > 0.78) p.r(Math.floor(hash(tx, i, 2) * 12), y + 1, 3, 1, shade(plank, -0.04));
  }
}

function paintCarpet(p: P, tx: number, ty: number, base: string) {
  p.r(0, 0, L, L, base);
  const a = shade(base, 0.06);
  const b = shade(base, -0.07);
  for (let y = 0; y < L; y += 2) {
    for (let x = (y / 2) % 2; x < L; x += 2) {
      const h = hash(tx * L + x, ty * L + y, 1);
      if (h > 0.82) p.px(x, y, a);
      else if (h < 0.12) p.px(x, y, b);
    }
  }
}

function isPool(tx: number, ty: number) {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && FLOOR[ty][tx] === Floor.Pool;
}

/** Água da piscina com borda de pedra onde encosta no deck. */
function paintPool(p: P, tx: number, ty: number) {
  p.r(0, 0, L, L, "#2f9fd6");
  // faixas de luz (ondas) contínuas entre tiles
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(hash(tx, ty, i + 20) * 12);
    const y = Math.floor(hash(ty, tx, i + 30) * 15);
    p.r(x, y, 3 + (i % 3), 1, i % 2 ? "#6cc7ee" : "#9fdcf5");
  }
  p.r(0, 0, L, 1, "rgba(255,255,255,0.08)");
  const COPING = "#e9e4da";
  const EDGE = "#b8b1a4";
  if (!isPool(tx, ty - 1)) {
    p.r(0, 0, L, 3, COPING);
    p.r(0, 3, L, 1, EDGE);
    p.r(0, 4, L, 2, "#1f7fb0");
  }
  if (!isPool(tx, ty + 1)) p.r(0, L - 2, L, 2, COPING);
  if (!isPool(tx - 1, ty)) {
    p.r(0, 0, 2, L, COPING);
    p.r(2, 0, 1, L, "#1f7fb0");
  }
  if (!isPool(tx + 1, ty)) p.r(L - 2, 0, 2, L, COPING);
}

/** Deck de pedra clara em volta da piscina. */
function paintPoolDeck(p: P, tx: number, ty: number) {
  const base = (tx + ty) % 2 ? "#e6dfd2" : "#ddd5c6";
  p.r(0, 0, L, L, base);
  p.r(0, L - 1, L, 1, "#cbc2b2");
  p.r(L - 1, 0, 1, L, "#cbc2b2");
  if (hash(tx, ty, 5) > 0.7) p.px(Math.floor(hash(ty, tx, 6) * 14) + 1, Math.floor(hash(tx, ty, 7) * 14) + 1, "#d0c7b7");
}

function paintConcrete(p: P, tx: number, ty: number) {
  const base = "#cfcac0";
  p.r(0, 0, L, L, base);
  p.r(0, L - 1, L, 1, "#bdb7ab");
  p.r(L - 1, 0, 1, L, "#bdb7ab");
  p.r(0, 0, L, 1, "#dbd6cd");
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash(tx, ty, i) * 14) + 1;
    const y = Math.floor(hash(ty, tx, i + 9) * 14) + 1;
    p.px(x, y, i % 2 ? "#c2bcb1" : "#d9d4ca");
  }
}

function paintKitchen(p: P) {
  const a = "#ece8df";
  const b = "#d3cdc1";
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) p.r(x * 8, y * 8, 8, 8, (x + y) % 2 ? b : a);
  p.r(0, 0, L, 1, "rgba(255,255,255,0.25)");
}

function paintDoor(p: P) {
  p.r(0, 0, L, L, "#9b8f7c");
  p.r(0, 0, L, 2, "#7c7262");
  p.r(0, L - 2, L, 2, "#7c7262");
  for (let x = 1; x < L; x += 3) p.r(x, 4, 1, 8, "#8a7f6c");
}

function paintFloorTile(p: P, f: Floor, tx: number, ty: number) {
  switch (f) {
    case Floor.Wood:
      return paintWood(p, tx, ty, "#b98457");
    case Floor.WoodDark:
      return paintWood(p, tx, ty, "#8e6142");
    case Floor.Concrete:
      return paintConcrete(p, tx, ty);
    case Floor.Kitchen:
      return paintKitchen(p);
    case Floor.Door:
      return paintDoor(p);
    case Floor.Pool:
      return paintPool(p, tx, ty);
    case Floor.PoolDeck:
      return paintPoolDeck(p, tx, ty);
    default: {
      const c = CARPETS[f];
      if (c) paintCarpet(p, tx, ty, c);
    }
  }
}

// ---------------------------------------------------------------------------
// Paredes
// ---------------------------------------------------------------------------

const WALL_TOP = "#343846";
const WALL_TOP_EDGE = "#4a4f60";
const WALL_FACE = "#e4ddd0";
const WALL_FACE_DK = "#d2c9b9";
const BASEBOARD = "#8f8373";

function isWall(tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return FLOOR[ty][tx] === Floor.Wall;
}

function paintWall(p: P, tx: number, ty: number) {
  const below = ty + 1 < MAP_H && !isWall(tx, ty + 1);
  if (below) {
    // face da parede visível (vista 3/4)
    p.r(0, 0, L, 4, WALL_TOP);
    p.r(0, 3, L, 1, WALL_TOP_EDGE);
    p.r(0, 4, L, 10, WALL_FACE);
    for (let x = 0; x < L; x += 4) if (hash(tx, x, 4) > 0.5) p.r(x, 5, 1, 8, WALL_FACE_DK);
    p.r(0, 13, L, 1, WALL_FACE_DK);
    p.r(0, 14, L, 2, BASEBOARD);
  } else {
    p.r(0, 0, L, L, WALL_TOP);
    // arestas claras nas bordas que encostam em piso
    if (!isWall(tx - 1, ty)) p.r(0, 0, 1, L, WALL_TOP_EDGE);
    if (!isWall(tx + 1, ty)) p.r(L - 1, 0, 1, L, WALL_TOP_EDGE);
    if (!isWall(tx, ty - 1)) p.r(0, 0, L, 1, WALL_TOP_EDGE);
    if (hash(tx, ty, 2) > 0.7) p.r(4, 6, 6, 1, "#3b4050");
  }
}

// ---------------------------------------------------------------------------
// Itens planos (tapetes / parede)
// ---------------------------------------------------------------------------

const RUGS = [
  { base: "#3f5672", border: "#d9c8a0", inner: "#4d6888" },
  { base: "#8a4f3d", border: "#e3c17a", inner: "#9b5d48" },
  { base: "#55635a", border: "#c7b48d", inner: "#647468" },
  { base: "#2f3d4f", border: "#f0a83a", inner: "#3b4b60" },
];

function paintRug(p: P, w: number, h: number, v: number) {
  const c = RUGS[v % RUGS.length];
  p.r(0, 0, w, h, shade(c.base, -0.3));
  p.r(1, 1, w - 2, h - 2, c.base);
  p.r(3, 3, w - 6, h - 6, c.border);
  p.r(4, 4, w - 8, h - 8, c.inner);
  for (let x = 6; x < w - 6; x += 6) {
    p.r(x, 6, 2, 2, c.border);
    p.r(x, h - 8, 2, 2, c.border);
  }
}

function paintRugRound(p: P, w: number, h: number, v: number) {
  const c = RUGS[v % RUGS.length];
  p.ellipse(w / 2, h / 2, w / 2, h / 2, shade(c.base, -0.3));
  p.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, c.base);
  p.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, c.border);
  p.ellipse(w / 2, h / 2, w / 2 - 5, h / 2 - 5, c.inner);
  p.ellipse(w / 2, h / 2, w / 5, h / 5, c.border);
}

function paintFlat(p: P, it: MapItem, w: number, h: number) {
  const v = it.v ?? 0;
  switch (it.type) {
    case "rug":
      return paintRug(p, w, h, v);
    case "rugRound":
      return paintRugRound(p, w, h, v);
    case "doormat":
      p.r(0, 0, w, h, "#2c2b30");
      p.r(1, 1, w - 2, h - 2, "#3a3940");
      for (let x = 3; x < w - 3; x += 2) p.r(x, 3, 1, h - 6, "#46454d");
      return;
    case "whiteboard":
      // na face da parede (y 4..13 do tile)
      p.r(2, 3, w - 4, 11, "#a6abb5");
      p.r(3, 4, w - 6, 9, "#f7f8fa");
      p.r(5, 6, 8, 1, "#2f6fde");
      p.r(5, 8, 12, 1, "#e0564c");
      p.r(18, 6, 6, 4, "#f0a83a");
      p.r(19, 7, 4, 2, "#f7f8fa");
      p.r(5, 10, 6, 1, "#1f9d8a");
      p.r(3, 13, w - 6, 1, "#7d828c");
      return;
    case "tv": {
      p.r(4, 2, w - 8, 12, "#16171c");
      p.r(5, 3, w - 10, 10, "#1f2a3d");
      // gráfico na tela
      p.r(7, 5, 10, 1, "#5b8def");
      p.r(7, 7, 14, 1, "#2a3c5c");
      const bars = [3, 5, 4, 7, 6, 8, 5];
      bars.forEach((b, i) => p.r(26 + i * 3, 12 - b, 2, b, i % 2 ? "#4fc3a1" : "#5b8def"));
      p.r(5, 3, w - 10, 1, "rgba(255,255,255,0.12)");
      return;
    }
    case "window":
      p.r(1, 1, w - 2, 13, "#3d4352");
      p.r(2, 2, w - 4, 11, "#9ccbe8");
      p.r(2, 2, w - 4, 4, "#bfe0f2");
      p.r(w / 2 - 0.5, 2, 1, 11, "#3d4352");
      p.r(2, 7, w - 4, 1, "#3d4352");
      p.r(4, 3, 3, 1, "#ffffff");
      p.r(1, 13, w - 2, 2, "#6b6f7a");
      return;
    case "painting": {
      const arts = [
        ["#2f6fde", "#f0a83a", "#f4efe6"],
        ["#1f9d8a", "#e0564c", "#efe7da"],
        ["#8b5cf6", "#f0a83a", "#f2eee7"],
        ["#e0564c", "#2f3d4f", "#f1ebdf"],
      ][v % 4];
      p.r(3, 3, 10, 9, "#5a4636");
      p.r(4, 4, 8, 7, arts[2]);
      p.ellipse(7, 7.5, 2.5, 2.5, arts[0]);
      p.r(8, 5, 3, 5, arts[1]);
      return;
    }
    case "clock":
      p.ellipse(8, 8, 5, 5, "#2d2f38");
      p.ellipse(8, 8, 4, 4, "#f7f4ee");
      p.r(8, 5, 1, 3, "#2d2f38");
      p.r(8, 8, 3, 1, "#e0564c");
      return;
    case "floatRing": {
      // boia vermelha e branca boiando
      const c1 = v % 2 ? "#f0a83a" : "#e0564c";
      p.ellipse(8, 8.5, 6.5, 5.5, "rgba(0,40,70,0.25)");
      p.ellipse(8, 8, 6.5, 5.5, c1);
      p.r(1.5, 7, 3, 2, "#ffffff");
      p.r(11.5, 7, 3, 2, "#ffffff");
      p.r(7, 2.5, 2, 2, "#ffffff");
      p.r(7, 11.5, 2, 2, "#ffffff");
      p.ellipse(8, 8, 3, 2.4, "#2f9fd6");
      p.r(5, 4, 3, 1, "rgba(255,255,255,0.6)");
      return;
    }
    case "poolLadder":
      // escada de inox na borda
      p.r(4, 2, 1, 12, "#c9d1d9");
      p.r(11, 2, 1, 12, "#c9d1d9");
      p.r(4, 2, 8, 1, "#eef2f5");
      for (const y of [6, 9, 12]) p.r(5, y, 6, 1, "#9aa6b2");
      return;
    case "glassDoor":
      p.r(0, 0, w, h, "#343846");
      p.r(2, 2, w - 4, h - 6, "#7fb6d6");
      p.r(2, 2, w - 4, 3, "#a9d2ea");
      p.r(w / 2 - 0.5, 2, 1, h - 6, "#343846");
      p.r(w / 2 - 3, 7, 2, 3, "#d9d9d9");
      p.r(w / 2 + 1, 7, 2, 3, "#d9d9d9");
      return;
  }
}

// ---------------------------------------------------------------------------
// Mobiliário (sprites)
// ---------------------------------------------------------------------------

const WOODS = ["#c79a6b", "#e9e5dc", "#a87650", "#d8c3a2", "#f1efe9"];
const CHAIRS = ["#3b3f4c", "#2f6fde", "#1f9d8a", "#e0564c"];
const SOFAS = ["#4a6d8c", "#7b5ea7", "#c7743b", "#3f7a68"];

/** Superfície de mesa: topo + frente, contorno. */
function tableBox(p: P, x: number, y: number, w: number, h: number, front: number, color: string) {
  p.r(x, y, w, h, OUTLINE);
  p.r(x + 1, y + 1, w - 2, h - 2 - front, color);
  p.r(x + 1, y + 1, w - 2, 1, shade(color, 0.15));
  p.r(x + 1, y + h - 1 - front, w - 2, front, shade(color, -0.25));
}

function monitor(p: P, x: number, y: number, facing: "front" | "back", v: number) {
  if (facing === "front") {
    p.r(x, y, 12, 8, OUTLINE);
    p.r(x + 1, y + 1, 10, 6, "#1d2433");
    const lines = ["#5b8def", "#4fc3a1", "#f0a83a", "#c792ea"];
    for (let i = 0; i < 3; i++) p.r(x + 2 + (i % 2), y + 2 + i * 1.5, 3 + ((v + i * 3) % 6), 1, lines[(v + i) % 4]);
    p.r(x + 5, y + 8, 2, 1, "#3a3d47");
    p.r(x + 3, y + 9, 6, 1, "#4a4d58");
  } else {
    p.r(x + 3, y - 1, 6, 1, "#4a4d58");
    p.r(x + 5, y, 2, 1, "#3a3d47");
    p.r(x, y + 1, 12, 6, OUTLINE);
    p.r(x + 1, y + 2, 10, 4, "#5a5e6b");
    p.r(x + 1, y + 2, 10, 1, "#6c707d");
  }
}

function deskExtras(p: P, x: number, y: number, v: number) {
  switch (v % 5) {
    case 0: // caneca
      p.r(x, y, 3, 3, "#f4f2ee");
      p.r(x + 3, y + 1, 1, 1, "#f4f2ee");
      p.r(x + 1, y, 1, 1, "#6b3f24");
      break;
    case 1: // planta mini
      p.r(x, y + 2, 3, 2, "#c46a3d");
      p.r(x - 1, y, 5, 2, "#4f9a52");
      p.r(x, y - 1, 2, 1, "#6cba5e");
      break;
    case 2: // papéis
      p.r(x - 1, y, 5, 4, "#f7f7f2");
      p.r(x, y + 1, 3, 1, "#b7bcc6");
      p.r(x, y + 2, 2, 1, "#b7bcc6");
      break;
    case 3: // notebook extra
      p.r(x - 2, y, 7, 4, "#9aa0ab");
      p.r(x - 1, y + 1, 5, 2, "#c8ccd4");
      break;
    default: // luminária de mesa
      p.r(x, y + 2, 3, 1, "#3a3d47");
      p.r(x + 1, y, 1, 2, "#3a3d47");
      p.r(x - 1, y - 1, 4, 1, "#f0a83a");
  }
}

function paintDesk(p: P, flip: boolean, v: number) {
  const wood = WOODS[v % WOODS.length];
  if (!flip) {
    tableBox(p, 0, 2, 32, 17, 3, wood);
    monitor(p, 10, 3, "front", v);
    p.r(10, 13, 9, 2, "#4a4d58"); // teclado
    p.r(11, 13, 7, 1, "#6a6e7a");
    p.r(21, 13, 2, 2, "#4a4d58"); // mouse
    deskExtras(p, 26, 5, v);
  } else {
    tableBox(p, 0, 1, 32, 17, 3, wood);
    p.r(10, 3, 9, 2, "#4a4d58");
    p.r(11, 4, 7, 1, "#6a6e7a");
    monitor(p, 10, 7, "back", v);
    deskExtras(p, 3, 4, v + 2);
  }
}

function paintChair(p: P, up: boolean, v: number) {
  const c = CHAIRS[v % CHAIRS.length];
  const dk = shade(c, -0.3);
  // base com rodinhas
  p.r(4, 13, 8, 1, "#2a2a33");
  p.r(3, 14, 2, 1, "#2a2a33");
  p.r(11, 14, 2, 1, "#2a2a33");
  p.r(7, 11, 2, 3, "#3a3a44");
  // assento
  p.r(3, 5, 10, 7, OUTLINE);
  p.r(4, 6, 8, 5, c);
  p.r(4, 6, 8, 1, shade(c, 0.2));
  if (up) {
    // encosto em cima
    p.r(3, 1, 10, 5, OUTLINE);
    p.r(4, 2, 8, 3, dk);
    p.r(4, 2, 8, 1, c);
  } else {
    // encosto embaixo (mais perto da câmera)
    p.r(3, 9, 10, 5, OUTLINE);
    p.r(4, 10, 8, 3, dk);
    p.r(4, 10, 8, 1, c);
  }
}

function paintConfTable(p: P, w: number, h: number, v: number) {
  const wood = v === 1 ? "#e9e5dc" : "#6e4b36";
  tableBox(p, 1, 3, w - 2, h - 5, 4, wood);
  // veio
  for (let y = 6; y < h - 9; y += 3) p.r(4, y, w - 8, 1, shade(wood, -0.06));
  // caixa de cabos central
  p.r(w / 2 - 3, h / 2 - 3, 6, 3, "#2d2f38");
  p.r(w / 2 - 2, h / 2 - 2, 1, 1, "#4fc3a1");
  // notebooks e papéis
  const spots = Math.floor((w - 16) / 18);
  for (let i = 0; i < spots; i++) {
    const x = 8 + i * 18;
    if ((i + v) % 3 === 0) {
      p.r(x, 6, 8, 5, "#9aa0ab");
      p.r(x + 1, 7, 6, 3, "#c8ccd4");
    } else if ((i + v) % 3 === 1) {
      p.r(x + 1, h - 15, 6, 4, "#f7f7f2");
      p.r(x + 2, h - 14, 4, 1, "#b7bcc6");
    } else {
      p.r(x + 2, 7, 3, 3, "#f4f2ee");
    }
  }
}

function paintRoundTable(p: P) {
  p.ellipse(16, 17, 14, 12, OUTLINE);
  p.ellipse(16, 18, 13, 10.5, "#b88a5f");
  p.ellipse(16, 16, 13, 10.5, "#d7ad7d");
  p.ellipse(16, 15, 11, 8, "#dfb98c");
  p.r(13, 13, 6, 4, "#9aa0ab");
  p.r(14, 14, 4, 2, "#c8ccd4");
  p.r(20, 18, 3, 3, "#f4f2ee");
}

function paintSofa(p: P, w: number, h: number, kind: "down" | "up" | "side", v: number) {
  const c = SOFAS[v % SOFAS.length];
  const dk = shade(c, -0.25);
  const hl = shade(c, 0.18);
  if (kind === "side") {
    // encosto à esquerda, assento virado para a direita
    p.r(1, 2, w - 2, h - 3, OUTLINE);
    p.r(2, 3, 7, h - 5, dk);
    p.r(2, 3, 7, 1, c);
    p.r(9, 6, w - 11, h - 11, c);
    const seats = 3;
    const seg = (h - 11) / seats;
    for (let i = 1; i < seats; i++) p.r(9, 6 + i * seg, w - 11, 1, dk);
    p.r(2, 2, w - 3, 4, hl);
    p.r(2, h - 5, w - 3, 4, dk);
    return;
  }
  p.r(1, 1, w - 2, h - 2, OUTLINE);
  if (kind === "down") {
    p.r(2, 2, w - 4, 7, dk); // encosto
    p.r(2, 2, w - 4, 1, c);
    p.r(5, 9, w - 10, 10, c);
    p.r(5, 9, w - 10, 1, hl);
    const seg = (w - 10) / 3;
    for (let i = 1; i < 3; i++) p.r(5 + i * seg, 9, 1, 10, dk);
    p.r(2, 7, 3, 15, hl); // braços
    p.r(w - 5, 7, 3, 15, hl);
    p.r(2, 19, w - 4, 3, dk);
  } else {
    p.r(2, 15, w - 4, 7, dk); // encosto embaixo
    p.r(2, 15, w - 4, 1, c);
    p.r(5, 4, w - 10, 11, c);
    p.r(5, 4, w - 10, 1, hl);
    const seg = (w - 10) / 3;
    for (let i = 1; i < 3; i++) p.r(5 + i * seg, 4, 1, 11, dk);
    p.r(2, 2, 3, 16, hl);
    p.r(w - 5, 2, 3, 16, hl);
  }
}

function paintArmchair(p: P, up: boolean, v: number) {
  const c = SOFAS[(v + 1) % SOFAS.length];
  const dk = shade(c, -0.25);
  const hl = shade(c, 0.18);
  p.r(2, 3, 20, 19, OUTLINE);
  if (!up) {
    p.r(3, 4, 18, 6, dk);
    p.r(3, 4, 18, 1, c);
    p.r(6, 10, 12, 9, c);
    p.r(6, 10, 12, 1, hl);
    p.r(3, 8, 3, 12, hl);
    p.r(18, 8, 3, 12, hl);
    p.r(3, 19, 18, 2, dk);
  } else {
    p.r(3, 15, 18, 6, dk);
    p.r(6, 5, 12, 10, c);
    p.r(6, 5, 12, 1, hl);
    p.r(3, 4, 3, 12, hl);
    p.r(18, 4, 3, 12, hl);
  }
}

function paintCoffeeTable(p: P) {
  tableBox(p, 1, 2, 30, 13, 3, "#5a4232");
  p.r(5, 5, 6, 4, "#e9e3d6");
  p.r(6, 6, 4, 1, "#b84a3a");
  p.r(19, 5, 3, 3, "#f4f2ee");
  p.r(20, 5, 1, 1, "#6b3f24");
}

function paintPlant(p: P, big: boolean, v: number) {
  const leaf = ["#3f8a4a", "#4c9a52", "#2f7a52"][v % 3];
  const leafHl = shade(leaf, 0.22);
  const leafDk = shade(leaf, -0.25);
  if (big) {
    // vaso
    p.r(4, 18, 8, 9, OUTLINE);
    p.r(5, 19, 6, 7, "#e9e3d6");
    p.r(5, 19, 6, 1, "#ffffff");
    p.r(5, 24, 6, 2, "#cfc7b8");
    // folhagem
    p.ellipse(8, 11, 7, 7.5, OUTLINE);
    p.ellipse(8, 11, 6, 6.5, leafDk);
    p.ellipse(6, 9, 4, 4, leaf);
    p.ellipse(10, 12, 4, 4, leaf);
    p.ellipse(8, 6, 3, 3, leaf);
    p.r(5, 7, 2, 1, leafHl);
    p.r(10, 10, 2, 1, leafHl);
    p.r(7, 4, 2, 1, leafHl);
    p.r(7, 14, 1, 5, "#5a4232");
  } else {
    p.r(5, 10, 6, 5, OUTLINE);
    p.r(6, 11, 4, 3, "#c46a3d");
    p.r(6, 11, 4, 1, "#d98458");
    p.ellipse(8, 8, 5, 4, OUTLINE);
    p.ellipse(8, 8, 4, 3, leaf);
    p.r(6, 6, 2, 1, leafHl);
    p.r(9, 8, 2, 1, leafHl);
  }
}

function paintBookshelf(p: P, v: number) {
  const wood = v === 1 ? "#e9e5dc" : "#7a573e";
  p.r(0, 0, 32, 28, OUTLINE);
  p.r(1, 1, 30, 3, shade(wood, 0.12));
  p.r(1, 4, 30, 23, shade(wood, -0.15));
  const books = ["#e0564c", "#2f6fde", "#f0a83a", "#1f9d8a", "#8b5cf6", "#f4f2ee", "#3a3f4b"];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 5 + shelf * 7;
    p.r(1, y + 6, 30, 1, wood);
    let x = 2;
    let i = shelf * 3 + v;
    while (x < 29) {
      const bw = 1 + ((i * 7) % 3);
      const bh = 4 + ((i * 5) % 3);
      if ((i * 11) % 9 !== 0) p.r(x, y + 6 - bh, bw, bh, books[i % books.length]);
      x += bw + ((i * 3) % 4 === 0 ? 2 : 0);
      i++;
    }
  }
}

function paintCounter(p: P, kind: "plain" | "sink" | "coffee") {
  p.r(0, 3, 16, 21, OUTLINE);
  p.r(0, 4, 16, 8, "#d8d6d1"); // tampo
  p.r(0, 4, 16, 1, "#eeece8");
  p.r(0, 12, 16, 11, "#f2efe9"); // armário
  p.r(1, 13, 14, 9, "#e6e1d8");
  p.r(7, 13, 1, 9, "#cfc8bb");
  p.r(5, 16, 1, 3, "#8a8f99");
  p.r(9, 16, 1, 3, "#8a8f99");
  if (kind === "sink") {
    p.r(3, 6, 10, 5, "#a9adb5");
    p.r(4, 7, 8, 3, "#c7cbd2");
    p.r(7, 4, 2, 3, "#8a8f99");
  } else if (kind === "coffee") {
    p.r(3, 0, 10, 10, OUTLINE);
    p.r(4, 1, 8, 8, "#2d2f38");
    p.r(5, 2, 6, 2, "#3f4250");
    p.r(9, 2, 1, 1, "#4fc3a1");
    p.r(6, 6, 4, 2, "#f4f2ee");
  } else {
    p.r(10, 6, 4, 3, "#e7c46b"); // tábua/frutas
    p.r(11, 7, 1, 1, "#e0564c");
  }
}

function paintFridge(p: P) {
  p.r(0, 0, 16, 31, OUTLINE);
  p.r(1, 1, 14, 29, "#cfd4db");
  p.r(1, 1, 14, 1, "#eef1f4");
  p.r(1, 11, 14, 1, "#9aa1ab");
  p.r(12, 4, 1, 5, "#7c838e");
  p.r(12, 14, 1, 8, "#7c838e");
  p.r(3, 15, 3, 3, "#f0a83a");
  p.r(6, 18, 2, 2, "#2f6fde");
  p.r(1, 28, 14, 2, "#9aa1ab");
}

function paintWaterCooler(p: P) {
  p.r(4, 0, 8, 9, OUTLINE);
  p.r(5, 1, 6, 7, "#8ecaf0");
  p.r(5, 1, 2, 7, "#b5def7");
  p.r(3, 9, 10, 14, OUTLINE);
  p.r(4, 10, 8, 12, "#eef0f3");
  p.r(5, 12, 2, 2, "#2f6fde");
  p.r(9, 12, 2, 2, "#e0564c");
  p.r(4, 21, 8, 1, "#c9ccd2");
}

function paintReceptionDesk(p: P) {
  // 80×32 lógicos
  p.r(0, 3, 80, 28, OUTLINE);
  p.r(1, 4, 78, 10, "#e9e5dc");
  p.r(1, 4, 78, 1, "#ffffff");
  p.r(1, 14, 78, 16, "#2f3a4c");
  p.r(1, 14, 78, 1, "#3e4b60");
  p.r(1, 26, 78, 3, "#1f2734");
  // faixa de destaque e "logo"
  p.r(1, 19, 78, 2, "#f0a83a");
  p.r(36, 16, 8, 8, "#f0a83a");
  p.r(38, 18, 4, 4, "#2f3a4c");
  // monitor, sino e planta
  monitor(p, 18, 3, "back", 0);
  p.r(55, 7, 4, 3, "#c8a24a");
  p.r(56, 6, 2, 1, "#e7c46b");
  p.r(66, 8, 4, 3, "#c46a3d");
  p.ellipse(68, 6, 3, 2.5, "#4c9a52");
}

function paintPingPong(p: P) {
  p.r(1, 2, 46, 28, OUTLINE);
  p.r(2, 3, 44, 22, "#2e7d5b");
  p.r(2, 3, 44, 1, "#3d9a72");
  p.r(2, 25, 44, 4, "#1f5a41");
  p.r(3, 4, 42, 1, "#f4f2ee");
  p.r(3, 23, 42, 1, "#f4f2ee");
  p.r(3, 4, 1, 20, "#f4f2ee");
  p.r(44, 4, 1, 20, "#f4f2ee");
  p.r(3, 13, 42, 1, "#f4f2ee");
  p.r(23, 1, 2, 26, "#d9d9d9");
  p.r(23, 3, 2, 22, "#bdbdbd");
  p.r(10, 8, 3, 3, "#e0564c");
  p.r(33, 17, 3, 3, "#2f3a4c");
  p.r(30, 9, 1, 1, "#ffffff");
}

function paintBeanBag(p: P, v: number) {
  const c = ["#e0564c", "#2f6fde", "#f0a83a", "#8b5cf6"][v % 4];
  p.ellipse(8, 9, 7.5, 6, OUTLINE);
  p.ellipse(8, 9, 6.5, 5, shade(c, -0.15));
  p.ellipse(7, 8, 5, 3.5, c);
  p.r(5, 6, 3, 1, shade(c, 0.3));
}

function paintLamp(p: P) {
  p.r(5, 25, 6, 2, OUTLINE);
  p.r(6, 25, 4, 1, "#3a3d47");
  p.r(7, 8, 2, 17, "#3a3d47");
  p.r(3, 1, 10, 8, OUTLINE);
  p.r(4, 2, 8, 6, "#f3e2b8");
  p.r(4, 2, 8, 1, "#fff4d6");
}

/** Caixa de som portátil (com alça), usada nas salas de reunião. */
function paintSpeaker(p: P) {
  p.ellipse(8, 19, 7, 1.5, "rgba(0,0,0,0.25)");
  // alça
  p.r(4, 1, 8, 1, OUTLINE);
  p.r(4, 1, 1, 5, OUTLINE);
  p.r(11, 1, 1, 5, OUTLINE);
  // corpo
  p.box(1, 5, 14, 14, "#1f2433", OUTLINE);
  p.r(2, 6, 12, 1, "#343b50");
  // alto-falantes
  for (const cx of [5, 11]) {
    p.ellipse(cx, 12, 3, 3, "#0f121b");
    p.ellipse(cx, 12, 2, 2, "#4a5268");
    p.r(cx - 0.5, 11.5, 1, 1, "#9aa3bd");
  }
  // luz azul (ligada)
  p.r(7, 7, 2, 1, "#2b6af3");
  p.r(3, 17, 10, 1, "#2b6af3");
}

/** Mesa de sinuca. */
function paintPoolTable(p: P) {
  p.r(1, 3, 46, 27, OUTLINE);
  p.r(2, 4, 44, 25, "#7a4a2b");
  p.r(2, 4, 44, 1, "#93603d");
  p.r(4, 6, 40, 18, "#1f7a4d");
  p.r(4, 6, 40, 1, "#27925d");
  p.r(2, 25, 44, 4, "#5c3820");
  for (const [x, y] of [[3, 5], [23, 4.5], [43, 5], [3, 23], [23, 23.5], [43, 23]]) p.ellipse(x + 1, y + 1, 1.6, 1.4, "#151515");
  const balls = ["#f4f2ee", "#f0c419", "#2f6fde", "#e0564c", "#8b5cf6", "#f08a3a", "#1f9d8a", "#151515"];
  balls.forEach((c, i) => p.ellipse(28 + (i % 4) * 2.4 + (i > 3 ? 1.2 : 0), 12 + Math.floor(i / 4) * 2.4, 1.1, 1.1, c));
  p.ellipse(13, 15, 1.2, 1.2, "#f4f2ee");
  p.r(8, 15, 12, 1, "#d8b07a");
  p.r(7, 28, 2, 3, "#4a2c18");
  p.r(39, 28, 2, 3, "#4a2c18");
}

/** Pebolim / totó. */
function paintFoosball(p: P) {
  p.r(1, 4, 30, 17, OUTLINE);
  p.r(2, 5, 28, 13, "#2e8a52");
  p.r(2, 5, 28, 1, "#3aa565");
  p.r(15.5, 5, 1, 13, "#d8f0e0");
  p.r(2, 18, 28, 2, "#6b4a2e");
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 6.5;
    p.r(x, 2, 1, 21, "#c9d1d9");
    const c = i % 2 ? "#2f6fde" : "#e0564c";
    for (const y of [7, 11, 15]) p.r(x - 0.5, y, 2, 2, c);
  }
  p.r(15, 10.5, 2, 2, "#ffffff");
  p.r(3, 21, 2, 3, "#3a2a1c");
  p.r(27, 21, 2, 3, "#3a2a1c");
}

/** Espreguiçadeira da piscina (vista de cima, cabeceira para cima). */
function paintLounger(p: P, v: number) {
  const stripe = v % 2 ? "#2b6af3" : "#1f9d8a";
  p.r(2, 3, 12, 27, OUTLINE);
  p.r(3, 4, 10, 25, "#f7f6f2");
  for (let y = 6; y < 28; y += 4) p.r(3, y, 10, 2, stripe);
  p.r(3, 4, 10, 6, "#ffffff");
  p.r(4, 5, 8, 3, "#eceae4");
  p.r(3, 29, 1, 2, "#8a8f99");
  p.r(12, 29, 1, 2, "#8a8f99");
}

function paintPrinter(p: P) {
  p.r(1, 6, 14, 13, OUTLINE);
  p.r(2, 7, 12, 5, "#e3e5ea");
  p.r(2, 12, 12, 6, "#c4c8d0");
  p.r(4, 4, 8, 4, "#f7f7f2");
  p.r(4, 13, 8, 1, "#2d2f38");
  p.r(11, 8, 2, 1, "#4fc3a1");
}

function paintDiningTable(p: P) {
  tableBox(p, 1, 4, 46, 24, 4, "#d7ad7d");
  p.r(6, 8, 4, 4, "#f4f2ee");
  p.r(7, 9, 2, 2, "#e0564c");
  p.r(22, 12, 6, 5, "#f4f2ee");
  p.r(23, 13, 4, 3, "#e7c46b");
  p.r(37, 9, 3, 3, "#f4f2ee");
  p.r(38, 9, 1, 1, "#6b3f24");
}

function paintStool(p: P) {
  p.ellipse(8, 8, 5, 4, OUTLINE);
  p.ellipse(8, 8, 4, 3, "#c7743b");
  p.r(6, 7, 3, 1, "#d98d58");
  p.r(7, 12, 2, 3, "#3a3d47");
}

function paintVending(p: P) {
  p.r(0, 0, 16, 31, OUTLINE);
  p.r(1, 1, 14, 29, "#c0392b");
  p.r(2, 3, 9, 20, "#20242e");
  const items = ["#f0a83a", "#2f6fde", "#4fc3a1", "#f4f2ee", "#e0564c"];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) p.r(3 + c * 3, 4 + r * 5, 2, 3, items[(r + c) % 5]);
  p.r(12, 5, 2, 6, "#20242e");
  p.r(12, 6, 2, 1, "#4fc3a1");
  p.r(2, 25, 12, 3, "#20242e");
}

function paintArcade(p: P) {
  p.r(0, 0, 16, 31, OUTLINE);
  p.r(1, 1, 14, 29, "#2b2d55");
  p.r(1, 1, 14, 4, "#8b5cf6");
  p.r(3, 2, 10, 2, "#f0a83a");
  p.r(2, 6, 12, 9, "#11131c");
  p.r(3, 7, 10, 7, "#1d2b4f");
  p.r(5, 9, 2, 2, "#4fc3a1");
  p.r(9, 11, 2, 2, "#e0564c");
  p.r(2, 16, 12, 4, "#3a3d6b");
  p.r(4, 17, 1, 2, "#e0564c");
  p.r(9, 17, 2, 2, "#f0a83a");
  p.r(12, 17, 1, 1, "#4fc3a1");
}

function paintCabinet(p: P) {
  p.r(1, 4, 14, 19, OUTLINE);
  p.r(2, 5, 12, 2, "#a2a7b0");
  for (let i = 0; i < 3; i++) {
    p.r(2, 7 + i * 5, 12, 5, i % 2 ? "#8c929c" : "#959ba5");
    p.r(6, 9 + i * 5, 4, 1, "#5f646d");
  }
}

function paintItem(p: P, type: ItemType, w: number, h: number, v: number) {
  switch (type) {
    case "desk":
      return paintDesk(p, false, v);
    case "deskFlip":
      return paintDesk(p, true, v);
    case "chair":
      return paintChair(p, false, v);
    case "chairUp":
      return paintChair(p, true, v);
    case "confTableLong":
      return paintConfTable(p, w, h, 0);
    case "confTable":
      return paintConfTable(p, w, h, 1);
    case "roundTable":
      return paintRoundTable(p);
    case "sofa":
      return paintSofa(p, w, h, "down", v);
    case "sofaUp":
      return paintSofa(p, w, h, "up", v);
    case "sofaSide":
      return paintSofa(p, w, h, "side", v);
    case "armchair":
      return paintArmchair(p, false, v);
    case "armchairUp":
      return paintArmchair(p, true, v);
    case "coffeeTable":
      return paintCoffeeTable(p);
    case "plantBig":
      return paintPlant(p, true, v);
    case "plantSmall":
      return paintPlant(p, false, v);
    case "bookshelf":
      return paintBookshelf(p, v);
    case "counter":
      return paintCounter(p, "plain");
    case "counterSink":
      return paintCounter(p, "sink");
    case "counterCoffee":
      return paintCounter(p, "coffee");
    case "fridge":
      return paintFridge(p);
    case "waterCooler":
      return paintWaterCooler(p);
    case "receptionDesk":
      return paintReceptionDesk(p);
    case "pingPong":
      return paintPingPong(p);
    case "beanBag":
      return paintBeanBag(p, v);
    case "lamp":
      return paintLamp(p);
    case "printer":
      return paintPrinter(p);
    case "speaker":
      return paintSpeaker(p);
    case "poolTable":
      return paintPoolTable(p);
    case "foosball":
      return paintFoosball(p);
    case "lounger":
      return paintLounger(p, v);
    case "diningTable":
      return paintDiningTable(p);
    case "stool":
      return paintStool(p);
    case "vending":
      return paintVending(p);
    case "arcade":
      return paintArcade(p);
    case "cabinet":
      return paintCabinet(p);
  }
}

/** Chave de textura de um item (tipo + variação). */
export function itemTextureKey(it: MapItem): string {
  return `item:${it.type}:${it.v ?? 0}`;
}

/** Desenha um sprite de móvel em um canvas próprio. */
export function drawItemCanvas(it: MapItem): HTMLCanvasElement {
  const def = ITEM_DEFS[it.type];
  const c = makeCanvas(def.w, def.h);
  const p = new P(ctx2d(c), 0, 0, S);
  paintItem(p, it.type, def.w / S, def.h / S, it.v ?? 0);
  return c;
}

/** Itens com sprite próprio (ordenados por profundidade no jogo). */
export function spriteItems(): MapItem[] {
  return ITEMS.filter((it) => !ITEM_DEFS[it.type].flat);
}

/** Renderiza o fundo completo: pisos, sombras, paredes e itens planos. */
export function drawBackground(): HTMLCanvasElement {
  const c = makeCanvas(WORLD_W, WORLD_H);
  const ctx = ctx2d(c);
  paintBackgroundInto(ctx);
  return c;
}

export function paintBackgroundInto(ctx: Ctx) {
  // 1) pisos
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const f = FLOOR[ty][tx];
      if (f === Floor.Wall) continue;
      paintFloorTile(new P(ctx, tx * TILE, ty * TILE, S), f, tx, ty);
    }
  }
  // 2) tapetes (no chão)
  for (const it of ITEMS) {
    if (it.type !== "rug" && it.type !== "rugRound" && it.type !== "doormat") continue;
    const w = ((it.tw ?? 1) * TILE) / S;
    const h = ((it.th ?? 1) * TILE) / S;
    paintFlat(new P(ctx, it.x * TILE, it.y * TILE, S), it, w, h);
  }
  // 3) oclusão ambiente sob paredes
  for (let ty = 1; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (FLOOR[ty][tx] === Floor.Wall) continue;
      if (FLOOR[ty - 1][tx] === Floor.Wall) {
        const g = ctx.createLinearGradient(0, ty * TILE, 0, ty * TILE + 12);
        g.addColorStop(0, "rgba(20,16,30,0.28)");
        g.addColorStop(1, "rgba(20,16,30,0)");
        ctx.fillStyle = g;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, 12);
      }
      if (tx > 0 && FLOOR[ty][tx - 1] === Floor.Wall) {
        ctx.fillStyle = "rgba(20,16,30,0.12)";
        ctx.fillRect(tx * TILE, ty * TILE, 4, TILE);
      }
    }
  }
  // 4) paredes
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      if (FLOOR[ty][tx] !== Floor.Wall) continue;
      paintWall(new P(ctx, tx * TILE, ty * TILE, S), tx, ty);
    }
  }
  // 5) itens de parede
  for (const it of ITEMS) {
    const def = ITEM_DEFS[it.type];
    if (!def.flat || it.type === "rug" || it.type === "rugRound" || it.type === "doormat") continue;
    paintFlat(new P(ctx, it.x * TILE, it.y * TILE, S), it, def.w / S, def.h / S);
  }
}

/**
 * Renderização completa (fundo + móveis ordenados) — usada na prévia da
 * página inicial, sem Phaser.
 */
export function drawFullScene(): HTMLCanvasElement {
  const c = drawBackground();
  const ctx = ctx2d(c);
  const items = spriteItems()
    .map((it) => ({ it, base: it.y * TILE + ITEM_DEFS[it.type].h }))
    .sort((a, b) => a.base - b.base);
  const cache = new Map<string, HTMLCanvasElement>();
  for (const { it } of items) {
    const key = itemTextureKey(it);
    let img = cache.get(key);
    if (!img) {
      img = drawItemCanvas(it);
      cache.set(key, img);
    }
    ctx.drawImage(img, Math.round(it.x * TILE), Math.round(it.y * TILE));
  }
  return c;
}
