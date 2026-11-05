/**
 * Definição do mapa do escritório (layout "hq-v2", compacto).
 *
 * O mapa é descrito em coordenadas de tile (1 tile = 32px no mundo).
 * Este módulo é puro (sem Phaser / DOM) e é usado no cliente (render,
 * colisão, zonas) e no servidor (validação de zone_key das salas).
 */

export const TILE = 32;
export const MAP_W = 52;
export const MAP_H = 24;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export enum Floor {
  Wall = 0,
  Wood = 1,
  WoodDark = 2,
  CarpetBlue = 3,
  CarpetGreen = 4,
  CarpetPlum = 5,
  CarpetSand = 6,
  Concrete = 7,
  Kitchen = 8,
  Door = 9,
  CarpetTeal = 10,
  /** Água da piscina (dá para entrar: o personagem aparece “nadando”). */
  Pool = 11,
  /** Deck de pedra em volta da piscina. */
  PoolDeck = 12,
  /** Carpete do salão de jogos. */
  CarpetGame = 13,
}

export type ZoneKind =
  | "meeting"
  | "reception"
  | "work"
  | "lounge"
  | "kitchen"
  | "corridor";

export interface Zone {
  key: string;
  label: string;
  kind: ZoneKind;
  /** Retângulo inclusivo, em tiles. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Para zonas de reunião: valores padrão ao criar a sala no banco. */
  defaultCapacity?: number;
  /** Salas de reunião: ponto do lado de fora da porta (tiles). */
  door?: { x: number; y: number };
}

/**
 * Ordem importa: a primeira zona que contém o ponto vence.
 * `door` (salas de reunião): ponto no corredor, do lado de fora da porta,
 * para onde a pessoa volta ao sair da reunião (em tiles).
 */
export const ZONES: Zone[] = [
  { key: "sala-principal", label: "Sala Principal", kind: "meeting", x1: 1, y1: 1, x2: 13, y2: 8, defaultCapacity: 12, door: { x: 7.5, y: 11 } },
  { key: "sala-01", label: "Sala de Reunião 01", kind: "meeting", x1: 15, y1: 1, x2: 23, y2: 8, defaultCapacity: 6, door: { x: 19.5, y: 11 } },
  { key: "sala-02", label: "Sala de Reunião 02", kind: "meeting", x1: 25, y1: 1, x2: 34, y2: 8, defaultCapacity: 4, door: { x: 29.5, y: 11 } },
  { key: "sala-03", label: "Sala de Reunião 03", kind: "meeting", x1: 27, y1: 13, x2: 34, y2: 22, defaultCapacity: 2, door: { x: 30.5, y: 11 } },
  { key: "copa", label: "Copa", kind: "kitchen", x1: 19, y1: 13, x2: 25, y2: 22 },
  { key: "trabalho", label: "Área de trabalho", kind: "work", x1: 1, y1: 13, x2: 17, y2: 22 },
  { key: "lazer", label: "Área de lazer", kind: "lounge", x1: 37, y1: 1, x2: 50, y2: 22 },
  { key: "corredor", label: "Corredor", kind: "corridor", x1: 1, y1: 10, x2: 35, y2: 11 },
];

export const MEETING_ZONES = ZONES.filter((z) => z.kind === "meeting");
export const MEETING_ZONE_KEYS = MEETING_ZONES.map((z) => z.key);

/** Ponto de nascimento (pés do personagem), em px. */
export const SPAWN = { x: 9 * TILE, y: 21.5 * TILE };

function buildFloor(): Floor[][] {
  const g: Floor[][] = Array.from({ length: MAP_H }, () =>
    Array.from({ length: MAP_W }, () => Floor.Wall),
  );
  const carve = (x1: number, y1: number, x2: number, y2: number, f: Floor) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) g[y][x] = f;
  };

  // Corredor
  carve(1, 10, 35, 11, Floor.Concrete);
  // Área de lazer: piscina (em cima) + salão de jogos (embaixo), porta para o corredor
  carve(37, 1, 50, 10, Floor.PoolDeck);
  carve(39, 2, 48, 7, Floor.Pool);
  carve(37, 11, 50, 22, Floor.CarpetGame);
  carve(36, 10, 36, 11, Floor.Door);
  // Salas de reunião (linha superior) + portas para o corredor
  carve(1, 1, 13, 8, Floor.CarpetBlue);
  carve(7, 9, 8, 9, Floor.Door);
  carve(15, 1, 23, 8, Floor.CarpetGreen);
  carve(19, 9, 20, 9, Floor.Door);
  carve(25, 1, 34, 8, Floor.CarpetPlum);
  carve(29, 9, 30, 9, Floor.Door);
  // Área de trabalho
  carve(1, 13, 17, 22, Floor.Wood);
  carve(8, 12, 9, 12, Floor.Door);
  carve(14, 12, 15, 12, Floor.Door);
  // Copa
  carve(19, 13, 25, 22, Floor.Kitchen);
  carve(22, 12, 23, 12, Floor.Door);
  carve(18, 17, 18, 18, Floor.Door);
  // Sala 03 (reunião pequena)
  carve(27, 13, 34, 22, Floor.CarpetTeal);
  carve(30, 12, 31, 12, Floor.Door);
  return g;
}

export const FLOOR: Floor[][] = buildFloor();

export function isWallTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return FLOOR[ty][tx] === Floor.Wall;
}

export function zoneAtTile(tx: number, ty: number): Zone | null {
  for (const z of ZONES) {
    if (tx >= z.x1 && tx <= z.x2 && ty >= z.y1 && ty <= z.y2) return z;
  }
  return null;
}

export function zoneAtPoint(px: number, py: number): Zone | null {
  return zoneAtTile(Math.floor(px / TILE), Math.floor(py / TILE));
}

export function zoneByKey(key: string): Zone | undefined {
  return ZONES.find((z) => z.key === key);
}

// ---------------------------------------------------------------------------
// Mobiliário
// ---------------------------------------------------------------------------

export type ItemType =
  | "desk"
  | "deskFlip"
  | "chair"
  | "chairUp"
  | "confTableLong"
  | "confTable"
  | "roundTable"
  | "sofa"
  | "sofaUp"
  | "sofaSide"
  | "armchair"
  | "armchairUp"
  | "coffeeTable"
  | "plantBig"
  | "plantSmall"
  | "bookshelf"
  | "counter"
  | "counterSink"
  | "counterCoffee"
  | "fridge"
  | "waterCooler"
  | "receptionDesk"
  | "pingPong"
  | "beanBag"
  | "lamp"
  | "printer"
  | "diningTable"
  | "stool"
  | "vending"
  | "arcade"
  | "cabinet"
  | "speaker"
  | "poolTable"
  | "foosball"
  | "lounger"
  | "floatRing"
  | "poolLadder"
  // Itens de parede / chão (vão para o fundo, sem colisão)
  | "rug"
  | "rugRound"
  | "doormat"
  | "whiteboard"
  | "tv"
  | "window"
  | "painting"
  | "clock"
  | "glassDoor";

export interface ItemDef {
  /** Tamanho do sprite em px. */
  w: number;
  h: number;
  /** Corpo de colisão relativo ao canto superior esquerdo (px). */
  body?: { x: number; y: number; w: number; h: number };
  /** Desenhado no fundo (chão/parede), sem ordenação de profundidade. */
  flat?: boolean;
}

export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  desk: { w: 64, h: 40, body: { x: 0, y: 4, w: 64, h: 34 } },
  deskFlip: { w: 64, h: 40, body: { x: 0, y: 2, w: 64, h: 34 } },
  chair: { w: 32, h: 32 },
  chairUp: { w: 32, h: 32 },
  confTableLong: { w: 256, h: 96, body: { x: 4, y: 8, w: 248, h: 84 } },
  confTable: { w: 160, h: 64, body: { x: 4, y: 6, w: 152, h: 54 } },
  roundTable: { w: 64, h: 64, body: { x: 8, y: 10, w: 48, h: 46 } },
  sofa: { w: 96, h: 48, body: { x: 2, y: 10, w: 92, h: 34 } },
  sofaUp: { w: 96, h: 48, body: { x: 2, y: 6, w: 92, h: 34 } },
  sofaSide: { w: 48, h: 96, body: { x: 4, y: 6, w: 38, h: 86 } },
  armchair: { w: 48, h: 48, body: { x: 6, y: 12, w: 36, h: 30 } },
  armchairUp: { w: 48, h: 48, body: { x: 6, y: 8, w: 36, h: 30 } },
  coffeeTable: { w: 64, h: 32, body: { x: 4, y: 6, w: 56, h: 22 } },
  plantBig: { w: 32, h: 56, body: { x: 6, y: 40, w: 20, h: 14 } },
  plantSmall: { w: 32, h: 32, body: { x: 8, y: 18, w: 16, h: 12 } },
  bookshelf: { w: 64, h: 56, body: { x: 0, y: 30, w: 64, h: 24 } },
  counter: { w: 32, h: 48, body: { x: 0, y: 8, w: 32, h: 38 } },
  counterSink: { w: 32, h: 48, body: { x: 0, y: 8, w: 32, h: 38 } },
  counterCoffee: { w: 32, h: 48, body: { x: 0, y: 8, w: 32, h: 38 } },
  fridge: { w: 32, h: 64, body: { x: 0, y: 26, w: 32, h: 36 } },
  waterCooler: { w: 32, h: 48, body: { x: 6, y: 30, w: 20, h: 16 } },
  receptionDesk: { w: 160, h: 64, body: { x: 0, y: 10, w: 160, h: 50 } },
  pingPong: { w: 96, h: 64, body: { x: 4, y: 8, w: 88, h: 52 } },
  beanBag: { w: 32, h: 32, body: { x: 4, y: 12, w: 24, h: 16 } },
  lamp: { w: 32, h: 56, body: { x: 10, y: 46, w: 12, h: 8 } },
  printer: { w: 32, h: 40, body: { x: 2, y: 14, w: 28, h: 24 } },
  diningTable: { w: 96, h: 64, body: { x: 4, y: 10, w: 88, h: 46 } },
  stool: { w: 32, h: 32 },
  vending: { w: 32, h: 64, body: { x: 0, y: 26, w: 32, h: 36 } },
  arcade: { w: 32, h: 64, body: { x: 2, y: 30, w: 28, h: 32 } },
  cabinet: { w: 32, h: 48, body: { x: 0, y: 18, w: 32, h: 28 } },
  speaker: { w: 32, h: 40, body: { x: 4, y: 24, w: 24, h: 14 } },
  poolTable: { w: 96, h: 64, body: { x: 4, y: 8, w: 88, h: 52 } },
  foosball: { w: 64, h: 48, body: { x: 2, y: 10, w: 60, h: 34 } },
  // sem colisão: dá para deitar em cima
  lounger: { w: 32, h: 64 },
  floatRing: { w: 32, h: 32, flat: true },
  poolLadder: { w: 32, h: 32, flat: true },
  rug: { w: 32, h: 32, flat: true },
  rugRound: { w: 32, h: 32, flat: true },
  doormat: { w: 32, h: 32, flat: true },
  whiteboard: { w: 64, h: 32, flat: true },
  tv: { w: 96, h: 32, flat: true },
  window: { w: 64, h: 32, flat: true },
  painting: { w: 32, h: 32, flat: true },
  clock: { w: 32, h: 32, flat: true },
  glassDoor: { w: 64, h: 32, flat: true },
};

export interface MapItem {
  type: ItemType;
  /** Canto superior esquerdo, em tiles (aceita frações). */
  x: number;
  y: number;
  /** Para itens redimensionáveis (tapetes): tamanho em tiles. */
  tw?: number;
  th?: number;
  /** Variação visual. */
  v?: number;
}

function deskCluster(x0: number, y0: number, count: number, seed: number): MapItem[] {
  // Linha superior (deskFlip, monitor virado para cima, cadeira acima) + linha inferior.
  const out: MapItem[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + i * 2;
    out.push({ type: "chairUp", x: x + 0.5, y: y0 - 0.85, v: (seed + i) % 4 });
    out.push({ type: "deskFlip", x, y: y0, v: (seed + i * 3) % 5 });
    out.push({ type: "desk", x, y: y0 + 1.25, v: (seed + i * 7 + 2) % 5 });
    out.push({ type: "chair", x: x + 0.5, y: y0 + 2.45, v: (seed + i + 1) % 4 });
  }
  return out;
}

const confChairs = (xs: number[], yUp: number, yDown: number, seed = 0): MapItem[] => [
  ...xs.map((x, i) => ({ type: "chairUp" as const, x, y: yUp, v: (seed + i) % 4 })),
  ...xs.map((x, i) => ({ type: "chair" as const, x, y: yDown, v: (seed + i + 2) % 4 })),
];

export const ITEMS: MapItem[] = [
  // ---------- Paredes externas ----------
  { type: "window", x: 3, y: 0 },
  { type: "window", x: 21.3, y: 0 },
  { type: "window", x: 31, y: 0 },

  // ---------- Sala Principal (12 cadeiras) ----------
  { type: "tv", x: 5.5, y: 0 },
  { type: "whiteboard", x: 10, y: 0 },
  { type: "rug", x: 2.5, y: 2, tw: 10, th: 6, v: 0 },
  { type: "confTableLong", x: 3, y: 3.6 },
  ...confChairs([3.2, 4.5, 5.8, 7.1, 8.4, 9.7], 2.6, 6.5),
  { type: "speaker", x: 11.9, y: 3.2 },
  { type: "plantBig", x: 1, y: 0.6 },
  { type: "plantBig", x: 12, y: 0.6 },
  { type: "plantSmall", x: 1, y: 7.4 },
  { type: "plantSmall", x: 12, y: 7.4 },

  // ---------- Sala 01 (6 cadeiras) ----------
  { type: "tv", x: 18, y: 0 },
  { type: "rug", x: 16, y: 2.4, tw: 7, th: 5, v: 1 },
  { type: "confTable", x: 17, y: 4 },
  ...confChairs([17.3, 19, 20.7], 3, 5.7, 1),
  { type: "speaker", x: 22.5, y: 3.4 },
  { type: "plantBig", x: 15.1, y: 0.6 },
  { type: "plantSmall", x: 22.8, y: 7.4 },

  // ---------- Sala 02 (4 cadeiras) ----------
  { type: "tv", x: 28, y: 0 },
  { type: "whiteboard", x: 25.5, y: 0 },
  { type: "rug", x: 26.5, y: 2.4, tw: 7, th: 5, v: 2 },
  { type: "confTable", x: 27.5, y: 4 },
  ...confChairs([28, 30.5], 3, 5.7, 2),
  { type: "speaker", x: 33.5, y: 3.4 },
  { type: "plantBig", x: 33.9, y: 0.6 },
  { type: "plantSmall", x: 25.1, y: 7.4 },

  // ---------- Sala 03 (2 cadeiras) ----------
  { type: "whiteboard", x: 32.4, y: 12 },
  { type: "rugRound", x: 28.6, y: 14.8, tw: 5, th: 5.2, v: 3 },
  { type: "roundTable", x: 30, y: 16.6 },
  ...confChairs([30.5], 15.6, 18.5, 3),
  { type: "sofaUp", x: 28.5, y: 20.5, v: 1 },
  { type: "speaker", x: 33.4, y: 15.6 },
  { type: "plantBig", x: 27.1, y: 12.6 },
  { type: "plantSmall", x: 33.9, y: 21.6 },
  { type: "lamp", x: 33.8, y: 20.4 },

  // ---------- Corredor ----------
  { type: "painting", x: 4, y: 9, v: 0 },
  { type: "painting", x: 12, y: 9, v: 1 },
  { type: "clock", x: 24, y: 9 },
  { type: "painting", x: 33, y: 9, v: 2 },
  { type: "plantSmall", x: 1, y: 9.8 },
  { type: "plantSmall", x: 34, y: 9.8 },

  // ---------- Área de trabalho ----------
  ...deskCluster(2, 15, 3, 0),
  ...deskCluster(10, 15, 3, 1),
  { type: "plantBig", x: 1, y: 12.6 },
  { type: "plantBig", x: 16.9, y: 12.6 },
  { type: "printer", x: 16.8, y: 19.2 },
  { type: "waterCooler", x: 1.1, y: 19.4 },
  { type: "bookshelf", x: 3, y: 20.7, v: 1 },
  { type: "armchair", x: 12, y: 20.6, v: 1 },
  { type: "armchair", x: 14, y: 20.6, v: 1 },
  { type: "plantSmall", x: 16.9, y: 21.6 },
  { type: "glassDoor", x: 8, y: 23 },
  { type: "doormat", x: 7.5, y: 21.6, tw: 3, th: 1.4 },

  // ---------- Copa ----------
  { type: "counter", x: 19, y: 12.4 },
  { type: "counterCoffee", x: 20, y: 12.4 },
  { type: "counterSink", x: 21, y: 12.4 },
  { type: "fridge", x: 24, y: 11.6 },
  { type: "diningTable", x: 20.5, y: 16.2 },
  ...[20.8, 22, 23.2].map((x) => ({ type: "stool" as const, x, y: 15.4 })),
  ...[20.8, 22, 23.2].map((x) => ({ type: "stool" as const, x, y: 18.1 })),
  { type: "sofaUp", x: 20.5, y: 20.6, v: 0 },
  { type: "vending", x: 25, y: 19.6 },
  { type: "plantBig", x: 19, y: 20.3 },

  // ---------- Área de lazer: piscina ----------
  { type: "window", x: 40, y: 0 },
  { type: "window", x: 46, y: 0 },
  { type: "poolLadder", x: 39, y: 1.6 },
  { type: "floatRing", x: 44.5, y: 4.2 },
  { type: "floatRing", x: 41, y: 6, v: 1 },
  { type: "lounger", x: 49.1, y: 1.4, v: 0 },
  { type: "lounger", x: 49.1, y: 3.7, v: 1 },
  { type: "lounger", x: 49.1, y: 6, v: 0 },
  { type: "plantBig", x: 37.1, y: 0.6 },
  { type: "plantBig", x: 37.1, y: 7.6 },
  { type: "plantSmall", x: 47.6, y: 8.6 },

  // ---------- Área de lazer: salão de jogos ----------
  { type: "rug", x: 38.4, y: 12.4, tw: 5.2, th: 3.6, v: 1 },
  { type: "poolTable", x: 39.5, y: 12.9 },
  { type: "foosball", x: 45, y: 13.1 },
  { type: "pingPong", x: 39.5, y: 17.4 },
  { type: "arcade", x: 49, y: 11.6 },
  { type: "arcade", x: 49, y: 13.8 },
  { type: "beanBag", x: 45, y: 18.6, v: 1 },
  { type: "beanBag", x: 46.5, y: 19.2, v: 3 },
  { type: "sofaUp", x: 44.8, y: 20.5, v: 2 },
  { type: "plantBig", x: 37.1, y: 20.4 },
  { type: "plantBig", x: 49.9, y: 20.4 },
];

// ---------------------------------------------------------------------------
// Colisão
// ---------------------------------------------------------------------------

/** Resolução da grade de colisão em px. */
export const COLL = 8;
export const COLL_W = WORLD_W / COLL;
export const COLL_H = WORLD_H / COLL;

export function buildCollisionGrid(): Uint8Array {
  const grid = new Uint8Array(COLL_W * COLL_H);
  const mark = (px: number, py: number, pw: number, ph: number) => {
    const x1 = Math.max(0, Math.floor(px / COLL));
    const y1 = Math.max(0, Math.floor(py / COLL));
    const x2 = Math.min(COLL_W - 1, Math.ceil((px + pw) / COLL) - 1);
    const y2 = Math.min(COLL_H - 1, Math.ceil((py + ph) / COLL) - 1);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) grid[y * COLL_W + x] = 1;
  };
  for (let ty = 0; ty < MAP_H; ty++)
    for (let tx = 0; tx < MAP_W; tx++)
      if (FLOOR[ty][tx] === Floor.Wall) mark(tx * TILE, ty * TILE, TILE, TILE);
  for (const it of ITEMS) {
    const def = ITEM_DEFS[it.type];
    if (!def.body || def.flat) continue;
    mark(it.x * TILE + def.body.x, it.y * TILE + def.body.y, def.body.w, def.body.h);
  }
  return grid;
}

/** Caixa de colisão dos pés do personagem (relativa ao ponto dos pés). */
export const FEET = { w: 18, h: 10 };

export function boxBlocked(grid: Uint8Array, cx: number, cy: number): boolean {
  const left = cx - FEET.w / 2;
  const top = cy - FEET.h;
  const x1 = Math.floor(left / COLL);
  const y1 = Math.floor(top / COLL);
  const x2 = Math.floor((left + FEET.w - 0.001) / COLL);
  const y2 = Math.floor((top + FEET.h - 0.001) / COLL);
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (x < 0 || y < 0 || x >= COLL_W || y >= COLL_H) return true;
      if (grid[y * COLL_W + x]) return true;
    }
  }
  return false;
}

/**
 * Move com colisão separando os eixos (permite "deslizar" em paredes).
 * Subdivide o passo para não atravessar obstáculos finos.
 */
export function moveWithCollision(
  grid: Uint8Array,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !boxBlocked(grid, x + sx, y)) x += sx;
    if (sy !== 0 && !boxBlocked(grid, x, y + sy)) y += sy;
  }
  return { x, y };
}

/** Encontra o ponto livre mais próximo (usado se o spawn/posição salva estiver bloqueado). */
export function nearestFree(grid: Uint8Array, x: number, y: number): { x: number; y: number } {
  if (!boxBlocked(grid, x, y)) return { x, y };
  for (let r = 8; r < 400; r += 8) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const nx = x + Math.cos(ang) * r;
      const ny = y + Math.sin(ang) * r;
      if (!boxBlocked(grid, nx, ny)) return { x: nx, y: ny };
    }
  }
  return { ...SPAWN };
}

// ---------------------------------------------------------------------------
// Assentos (cadeiras clicáveis das salas de reunião)
// ---------------------------------------------------------------------------

export interface Seat {
  zoneKey: string;
  /** Posição dos pés do personagem sentado (px). */
  x: number;
  y: number;
  /** Para onde o personagem olha. */
  dir: "up" | "down" | "left" | "right";
}

export const SEATS: Seat[] = ITEMS.flatMap((it) => {
  if (it.type !== "chair" && it.type !== "chairUp") return [];
  const x = it.x * TILE + 16;
  const y = it.y * TILE + 24;
  const z = zoneAtPoint(x, y - 4);
  if (!z || z.kind !== "meeting") return [];
  return [{ zoneKey: z.key, x, y, dir: it.type === "chairUp" ? ("down" as const) : ("up" as const) }];
});

export function seatsOf(zoneKey: string): Seat[] {
  return SEATS.filter((s) => s.zoneKey === zoneKey);
}

/**
 * Mesas da área de trabalho (uma cadeira = uma mesa), em ordem fixa.
 * O índice é o que fica salvo como "mesa fixa" da pessoa.
 */
export const DESK_SEATS: Seat[] = ITEMS.flatMap((it) => {
  if (it.type !== "chair" && it.type !== "chairUp") return [];
  const x = it.x * TILE + 16;
  const y = it.y * TILE + 24;
  const z = zoneAtPoint(x, y - 4);
  if (!z || z.kind !== "work") return [];
  return [{ zoneKey: z.key, x, y, dir: it.type === "chairUp" ? ("down" as const) : ("up" as const) }];
});

/** Primeiro assento livre (ninguém a menos de 14px), ou o primeiro da sala. */
export function freeSeat(zoneKey: string, occupied: { x: number; y: number }[]): Seat | null {
  const seats = seatsOf(zoneKey);
  return seats.find((s) => occupied.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 14)) ?? seats[0] ?? null;
}

// ---------------------------------------------------------------------------
// Objetos clicáveis: sentar, abrir a geladeira, pegar café, jogar...
// ---------------------------------------------------------------------------

export type InteractionKind = "sit" | "fridge" | "coffee" | "vending" | "water" | "game";

const INTERACT: Partial<Record<ItemType, { kind: InteractionKind; label: string; emoji?: string }>> = {
  stool: { kind: "sit", label: "Banqueta" },
  sofa: { kind: "sit", label: "Sofá" },
  sofaUp: { kind: "sit", label: "Sofá" },
  sofaSide: { kind: "sit", label: "Sofá" },
  armchair: { kind: "sit", label: "Poltrona" },
  armchairUp: { kind: "sit", label: "Poltrona" },
  beanBag: { kind: "sit", label: "Pufe" },
  lounger: { kind: "sit", label: "Espreguiçadeira" },
  fridge: { kind: "fridge", label: "Geladeira" },
  counterCoffee: { kind: "coffee", label: "Cafeteira" },
  vending: { kind: "vending", label: "Máquina de lanches" },
  waterCooler: { kind: "water", label: "Bebedouro", emoji: "💧" },
  poolTable: { kind: "game", label: "Sinuca", emoji: "🎱" },
  foosball: { kind: "game", label: "Totó", emoji: "⚽" },
  pingPong: { kind: "game", label: "Pingue-pongue", emoji: "🏓" },
  arcade: { kind: "game", label: "Fliperama", emoji: "🕹️" },
};

export interface Interaction {
  item: MapItem;
  type: ItemType;
  kind: InteractionKind;
  label: string;
  emoji?: string;
  /** Onde o personagem fica (pés, px) e para onde olha. */
  x: number;
  y: number;
  dir: "up" | "down" | "left" | "right";
}

function interactionSpot(it: MapItem): { x: number; y: number; dir: Interaction["dir"] } {
  const def = ITEM_DEFS[it.type];
  const left = it.x * TILE;
  const top = it.y * TILE;
  const cx = left + def.w / 2;
  if (!def.body) return { x: cx, y: top + def.h * 0.75, dir: "down" };
  const b = def.body;
  switch (it.type) {
    // Sofá/poltrona “de costas”: senta do lado de cima (fica atrás do encosto).
    case "sofaUp":
    case "armchairUp":
      return { x: cx, y: top + b.y + 6, dir: "up" };
    case "sofaSide":
      return { x: left + b.x + b.w + 8, y: top + b.y + b.h / 2, dir: "left" };
    case "sofa":
    case "armchair":
    case "beanBag":
      return { x: cx, y: top + b.y + b.h + 12, dir: "down" };
    default:
      // aparelhos e jogos: fica de frente, do lado de baixo
      return { x: cx, y: top + b.y + b.h + 18, dir: "up" };
  }
}

export const INTERACTIONS: Interaction[] = ITEMS.flatMap((it) => {
  const info = INTERACT[it.type];
  if (!info) return [];
  return [{ item: it, type: it.type, ...info, ...interactionSpot(it) }];
});

/** Está dentro da água da piscina? (pés do personagem, px) */
export function inPool(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor((py - 2) / TILE);
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && FLOOR[ty][tx] === Floor.Pool;
}
