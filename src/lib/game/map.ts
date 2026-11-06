/**
 * Definição do mapa do escritório.
 *
 * O mapa é descrito em coordenadas de tile (1 tile = 32px no mundo). Existem dois tipos:
 * - "clássico" (hq-v2): o desenhado à mão, usado pelas sedes antigas (layout = null);
 * - "gerado": montado a partir da configuração da sede (salas, cadeiras, mesas, copa, lazer).
 *
 * O cliente aplica o mapa da sede com `applyMap(buildMap(spec))` antes de criar o jogo; os
 * valores exportados (ZONES, ITEMS, FLOOR…) são "live bindings" e passam a refletir esse mapa.
 * No servidor use sempre `buildMap(spec)` + as funções puras (`seatsIn`, `deskSeatsIn`…).
 */

export const TILE = 32;

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

/** Onde fica a placa com o nome da sala (na parede do corredor, ao lado da porta), em tiles. */
export interface RoomDecorSpot {
  plate: { x: number; y: number };
  /** Largura máxima da placa (tiles). */
  maxW?: number;
}

/** Painel com a logo da empresa (na parede), centro em tiles. */
export interface LogoSpot {
  x: number;
  y: number;
  w: number;
}

export interface MapData {
  /** Tamanho em tiles. */
  w: number;
  h: number;
  floor: Floor[][];
  /** Ordem importa: a primeira zona que contém o ponto vence. */
  zones: Zone[];
  items: MapItem[];
  decor: Record<string, RoomDecorSpot>;
  /** Ponto de nascimento (pés do personagem), em px. */
  spawn: { x: number; y: number };
  logo: LogoSpot | null;
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
  | "confTableMid"
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
  confTableMid: { w: 216, h: 96, body: { x: 4, y: 8, w: 208, h: 84 } },
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


// ---------------------------------------------------------------------------
// Mapa clássico (hq-v2, desenhado à mão)
// ---------------------------------------------------------------------------

/**
 * `door` (salas de reunião): ponto no corredor, do lado de fora da porta,
 * para onde a pessoa volta ao sair da reunião (em tiles).
 */
const CLASSIC_ZONES: Zone[] = [
  { key: "sala-principal", label: "Sala Principal", kind: "meeting", x1: 1, y1: 1, x2: 13, y2: 8, defaultCapacity: 12, door: { x: 7.5, y: 11 } },
  { key: "sala-01", label: "Sala de Reunião 01", kind: "meeting", x1: 15, y1: 1, x2: 23, y2: 8, defaultCapacity: 12, door: { x: 19.5, y: 11 } },
  { key: "sala-02", label: "Sala de Reunião 02", kind: "meeting", x1: 25, y1: 1, x2: 34, y2: 8, defaultCapacity: 6, door: { x: 29.5, y: 11 } },
  { key: "sala-03", label: "Sala de Reunião 03", kind: "meeting", x1: 27, y1: 13, x2: 34, y2: 22, defaultCapacity: 2, door: { x: 30.5, y: 11 } },
  { key: "copa", label: "Copa", kind: "kitchen", x1: 19, y1: 13, x2: 25, y2: 22 },
  { key: "trabalho", label: "Área de trabalho", kind: "work", x1: 1, y1: 13, x2: 17, y2: 22 },
  { key: "lazer", label: "Área de lazer", kind: "lounge", x1: 37, y1: 1, x2: 50, y2: 22 },
  { key: "corredor", label: "Corredor", kind: "corridor", x1: 1, y1: 10, x2: 35, y2: 11 },
];

const CLASSIC_DECOR: Record<string, RoomDecorSpot> = {
  "sala-principal": { plate: { x: 11.2, y: 9.45 } },
  "sala-01": { plate: { x: 23.2, y: 9.45 } },
  "sala-02": { plate: { x: 32.9, y: 9.45 } },
  "sala-03": { plate: { x: 28.4, y: 12.45 } },
};

function classicFloor(): Floor[][] {
  const g: Floor[][] = Array.from({ length: 24 }, () =>
    Array.from({ length: 52 }, () => Floor.Wall),
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

const CLASSIC_ITEMS: MapItem[] = [
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

  // ---------- Sala 01 (12 cadeiras) ----------
  { type: "tv", x: 18, y: 0 },
  { type: "rug", x: 15.6, y: 2, tw: 7.8, th: 6, v: 1 },
  { type: "confTableMid", x: 16.1, y: 3.6 },
  ...confChairs([16.25, 17.4, 18.55, 19.7, 20.85, 22], 2.6, 6.5, 1),
  { type: "speaker", x: 22.8, y: 0.9 },
  { type: "plantBig", x: 15.1, y: 0.6 },
  { type: "plantSmall", x: 22.8, y: 7.4 },

  // ---------- Sala 02 (6 cadeiras) ----------
  { type: "tv", x: 28, y: 0 },
  { type: "whiteboard", x: 25.5, y: 0 },
  { type: "rug", x: 26.5, y: 2.4, tw: 7, th: 5, v: 2 },
  { type: "confTable", x: 27.5, y: 4 },
  ...confChairs([27.8, 29.5, 31.2], 3, 5.7, 2),
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
  { type: "clock", x: 17.4, y: 9 },
  { type: "plantSmall", x: 1, y: 9.8 },
  { type: "plantSmall", x: 34, y: 9.8 },
  { type: "speaker", x: 15.6, y: 8.9 },
  { type: "speaker", x: 26.6, y: 8.9 },

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
  { type: "speaker", x: 46.9, y: 11.2 },
  { type: "arcade", x: 49, y: 11.6 },
  { type: "arcade", x: 49, y: 13.8 },
  { type: "beanBag", x: 45, y: 18.6, v: 1 },
  { type: "beanBag", x: 46.5, y: 19.2, v: 3 },
  { type: "sofaUp", x: 44.8, y: 20.5, v: 2 },
  { type: "plantBig", x: 37.1, y: 20.4 },
  { type: "plantBig", x: 49.9, y: 20.4 },
];

/** Chaves das salas de reunião do mapa clássico (e os padrões de nome/capacidade). */
export const CLASSIC_MEETING_ZONES = CLASSIC_ZONES.filter((z) => z.kind === "meeting");

export function classicMap(): MapData {
  return {
    w: 52,
    h: 24,
    floor: classicFloor(),
    zones: CLASSIC_ZONES,
    items: CLASSIC_ITEMS,
    decor: CLASSIC_DECOR,
    spawn: { x: 9 * TILE, y: 21.5 * TILE },
    logo: { x: 11.8, y: 12.45, w: 3.4 },
  };
}

// ---------------------------------------------------------------------------
// Mapa gerado (sedes personalizadas): salas, mesas, copa e lazer a partir da configuração
// ---------------------------------------------------------------------------

/** O que dá para configurar numa sede (fica em `offices.layout`). */
export interface LayoutOptions {
  /** Lugares na área de trabalho (arredonda para par). */
  desks: number;
  kitchen: boolean;
  pool: boolean;
  games: boolean;
}

/** Configuração completa: opções da sede + salas (na ordem do mapa). */
export interface LayoutSpec extends LayoutOptions {
  rooms: { key: string; seats: number }[];
}

export const MAX_ROOMS = 12;
export const MAX_ROOM_SEATS = 24;
export const MIN_DESKS = 2;
export const MAX_DESKS = 40;
export const DEFAULT_LAYOUT: LayoutOptions = { desks: 12, kitchen: true, pool: true, games: true };

/** Chave de área para salas de sedes personalizadas (sala-01, sala-02…). */
export const GEN_ROOM_KEY = /^sala-\d{2}$/;
export function nextRoomKey(used: string[]): string {
  for (let i = 1; i < 100; i++) {
    const k = `sala-${String(i).padStart(2, "0")}`;
    if (!used.includes(k)) return k;
  }
  return `sala-${Date.now() % 100}`;
}

const TOP_Y1 = 1;
const TOP_Y2 = 8;
const BOT_Y1 = 13;
const BOT_Y2 = 22;
const LAZER_W = 14;
const ROOM_FLOORS = [Floor.CarpetBlue, Floor.CarpetGreen, Floor.CarpetPlum, Floor.CarpetTeal, Floor.CarpetSand];

type Block =
  | { t: "room"; key: string; seats: number; w: number; x1?: number }
  | { t: "work"; desks: number; w: number; x1?: number }
  | { t: "kitchen"; w: number; x1?: number }
  | { t: "lounge"; w: number; x1?: number };

function roomWidth(seats: number, bottom: boolean) {
  const w = seats <= 2 ? 6 : seats <= 6 ? 8 : seats <= 12 ? 11 : 20;
  // Embaixo a TV divide a parede com a porta e a placa: precisa de mais espaço.
  return bottom ? Math.max(10, w) : w;
}

function workDims(desks: number) {
  const pairs = Math.max(1, Math.ceil(Math.max(MIN_DESKS, desks) / 2));
  const clusters = Math.ceil(pairs / 3);
  const rows = clusters > 2 ? 2 : 1;
  const cols = Math.ceil(clusters / rows);
  return { pairs, rows, cols, w: cols * 8 + 2 };
}

const span = (bs: Block[]) => bs.reduce((s, b) => s + b.w, 0) + Math.max(0, bs.length - 1);

/** Cadeiras distribuídas ao longo de uma mesa (de `tx` com `tw` tiles de largura). */
function chairsAlong(tx: number, tw: number, n: number, y: number, up: boolean, seed: number): MapItem[] {
  return Array.from({ length: n }, (_, i) => ({
    type: up ? ("chairUp" as const) : ("chair" as const),
    x: tx + (tw * (i + 0.5)) / n - 0.5,
    y,
    v: (seed + i + (up ? 0 : 2)) % 4,
  }));
}

function roomItems(x1: number, w: number, bottom: boolean, seats: number, idx: number): MapItem[] {
  const y1 = bottom ? BOT_Y1 : TOP_Y1;
  const y2 = bottom ? BOT_Y2 : TOP_Y2;
  const x2 = x1 + w - 1;
  const ty = y1 + (bottom ? 1.5 : 0);
  const out: MapItem[] = [];
  const s = Math.max(1, Math.min(MAX_ROOM_SEATS, seats));
  if (s <= 2) {
    const tx = x1 + (w - 2) / 2;
    out.push({ type: "rugRound", x: tx - 1.5, y: ty + 1.4, tw: 5, th: 5.2, v: idx % 4 });
    out.push({ type: "roundTable", x: tx, y: ty + 3 });
    out.push({ type: "chairUp", x: tx + 0.5, y: ty + 2, v: idx % 4 });
    if (s === 2) out.push({ type: "chair", x: tx + 0.5, y: ty + 4.9, v: (idx + 2) % 4 });
  } else if (s <= 6) {
    const tx = x1 + (w - 5) / 2;
    out.push({ type: "rug", x: tx - 0.5, y: ty + 1.4, tw: 6, th: 5, v: idx % 4 });
    out.push({ type: "confTable", x: tx, y: ty + 3 });
    out.push(...chairsAlong(tx, 5, Math.ceil(s / 2), ty + 2, true, idx));
    out.push(...chairsAlong(tx, 5, Math.floor(s / 2), ty + 4.7, false, idx));
  } else {
    const tables = s > 12 ? 2 : 1;
    const first = tables === 1 ? x1 + (w - 8) / 2 : x1 + (w - 17) / 2;
    for (let t = 0; t < tables; t++) {
      const tx = first + t * 9;
      const n = tables === 1 ? s : t === 0 ? Math.ceil(s / 2) : Math.floor(s / 2);
      out.push({ type: "rug", x: tx - 0.5, y: ty + 1, tw: 9, th: 6, v: idx % 4 });
      out.push({ type: "confTableLong", x: tx, y: ty + 2.6 });
      out.push(...chairsAlong(tx, 8, Math.ceil(n / 2), ty + 1.6, true, idx + t));
      out.push(...chairsAlong(tx, 8, Math.floor(n / 2), ty + 5.5, false, idx + t));
    }
  }
  // Cantos
  out.push({ type: "plantBig", x: x1, y: y1 - 0.4 });
  out.push({ type: "speaker", x: x2 - 0.05, y: y1 - 0.1 });
  out.push({ type: "plantSmall", x: x1, y: y2 - 0.6 });
  out.push({ type: "plantSmall", x: x2, y: y2 - 0.6 });
  // Parede: TV (onde vai a logo), quadro e janela
  if (!bottom) {
    out.push({ type: "tv", x: x1 + (w - 3) / 2, y: 0 });
    if (w >= 8) out.push({ type: "window", x: x2 - 1.3, y: 0 });
    if (w >= 11) out.push({ type: "whiteboard", x: x1 + 1.2, y: 0 });
  } else {
    out.push({ type: "tv", x: x1 + 3.5 + plateWidth(w, true), y: 12 });
  }
  return out;
}

/** Largura da placa com o nome (tiles), à direita da porta. */
function plateWidth(w: number, bottom: boolean) {
  return bottom ? Math.min(3.8, w - 6.6) : Math.min(3.8, w - 2.6);
}

function loungeItems(x1: number, w: number, bottom: boolean): MapItem[] {
  const y1 = bottom ? BOT_Y1 : TOP_Y1;
  const y2 = bottom ? BOT_Y2 : TOP_Y2;
  const x2 = x1 + w - 1;
  const out: MapItem[] = [
    { type: "plantBig", x: x1, y: y1 - 0.4 },
    { type: "plantBig", x: x2, y: y1 - 0.4 },
    { type: "plantSmall", x: x1, y: y2 - 0.6 },
    { type: "plantSmall", x: x2, y: y2 - 0.6 },
  ];
  if (w < 5) return out;
  const groups = Math.max(1, Math.floor(w / 9));
  const gy = bottom ? y1 + 4 : y1 + 1.2;
  for (let g = 0; g < groups; g++) {
    const cx = x1 + (w * (g + 0.5)) / groups;
    out.push({ type: "rug", x: cx - 2, y: gy - 0.2, tw: 4, th: 3.6, v: g % 4 });
    out.push({ type: "sofa", x: cx - 1.5, y: gy, v: g % 3 });
    out.push({ type: "coffeeTable", x: cx - 1, y: gy + 1.9 });
    if (!bottom) out.push({ type: "window", x: cx - 1, y: 0 });
  }
  if (w >= 7 && !bottom) out.push({ type: "bookshelf", x: x1 + 1.2, y: y2 - 1.2, v: 1 });
  return out;
}

function workItems(x1: number, w: number, desks: number): { items: MapItem[]; spawn: { x: number; y: number } } {
  const d = workDims(desks);
  const x2 = x1 + w - 1;
  const items: MapItem[] = [];
  const rowsY = d.rows === 1 ? [15] : [14, 18.4];
  let left = d.pairs;
  let ci = 0;
  for (let r = 0; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++) {
      if (left <= 0) break;
      const n = Math.min(3, left);
      left -= n;
      items.push(...deskCluster(x1 + 3 + c * 8, rowsY[r], n, ci++));
    }
  items.push(
    { type: "plantBig", x: x1, y: 12.6 },
    { type: "plantBig", x: x2, y: 12.6 },
    { type: "waterCooler", x: x1 + 0.1, y: 16.4 },
    { type: "doormat", x: x1, y: 21.6, tw: 3, th: 1.4 },
    { type: "glassDoor", x: x1 + 0.5, y: 23 },
  );
  if (d.rows === 1) {
    items.push(
      { type: "bookshelf", x: x1 + 3.5, y: 20.7, v: 1 },
      { type: "armchair", x: x2 - 3.6, y: 20.6, v: 1 },
      { type: "armchair", x: x2 - 1.8, y: 20.6, v: 1 },
      { type: "printer", x: x2 - 0.2, y: 18.2 },
    );
  }
  return { items, spawn: { x: (x1 + 1.5) * TILE, y: 21.5 * TILE } };
}

/** Copa (igual à do mapa clássico, deslocada). */
function kitchenItems(x1: number): MapItem[] {
  const dx = x1 - 19;
  return [
    { type: "counter", x: 19 + dx, y: 12.4 },
    { type: "counterCoffee", x: 20 + dx, y: 12.4 },
    { type: "counterSink", x: 21 + dx, y: 12.4 },
    { type: "fridge", x: 24 + dx, y: 11.6 },
    { type: "diningTable", x: 20.5 + dx, y: 16.2 },
    ...[20.8, 22, 23.2].map((x) => ({ type: "stool" as const, x: x + dx, y: 15.4 })),
    ...[20.8, 22, 23.2].map((x) => ({ type: "stool" as const, x: x + dx, y: 18.1 })),
    { type: "sofaUp", x: 20.5 + dx, y: 20.6, v: 0 },
    { type: "vending", x: 25 + dx, y: 19.6 },
    { type: "plantBig", x: 19 + dx, y: 20.3 },
  ];
}

/** Área de lazer (piscina em cima, salão de jogos embaixo), igual à do clássico, deslocada. */
function lazerItems(lx1: number, pool: boolean, games: boolean): MapItem[] {
  const dx = lx1 - 37;
  const at = (list: MapItem[]) => list.map((it) => ({ ...it, x: it.x + dx }));
  const out: MapItem[] = [];
  out.push(...at([{ type: "window", x: 40, y: 0 }, { type: "window", x: 46, y: 0 }]));
  if (pool) {
    out.push(
      ...at([
        { type: "poolLadder", x: 39, y: 1.6 },
        { type: "floatRing", x: 44.5, y: 4.2 },
        { type: "floatRing", x: 41, y: 6, v: 1 },
        { type: "lounger", x: 49.1, y: 1.4, v: 0 },
        { type: "lounger", x: 49.1, y: 3.7, v: 1 },
        { type: "lounger", x: 49.1, y: 6, v: 0 },
        { type: "plantBig", x: 37.1, y: 0.6 },
        { type: "plantBig", x: 37.1, y: 7.6 },
        { type: "plantSmall", x: 47.6, y: 8.6 },
      ]),
    );
  } else {
    out.push(
      ...at([
        { type: "rug", x: 39.5, y: 2.5, tw: 7, th: 4, v: 2 },
        { type: "sofa", x: 41.5, y: 2.6, v: 2 },
        { type: "coffeeTable", x: 42, y: 4.5 },
        { type: "beanBag", x: 40, y: 5.6, v: 0 },
        { type: "beanBag", x: 45.5, y: 5.6, v: 2 },
        { type: "arcade", x: 49, y: 1.6 },
        { type: "arcade", x: 49, y: 4 },
        { type: "plantBig", x: 37.1, y: 0.6 },
        { type: "plantBig", x: 37.1, y: 7.6 },
      ]),
    );
  }
  if (games) {
    out.push(
      ...at([
        { type: "rug", x: 38.4, y: 12.4, tw: 5.2, th: 3.6, v: 1 },
        { type: "poolTable", x: 39.5, y: 12.9 },
        { type: "foosball", x: 45, y: 13.1 },
        { type: "pingPong", x: 39.5, y: 17.4 },
        { type: "speaker", x: 46.9, y: 11.2 },
        { type: "arcade", x: 49, y: 11.6 },
        { type: "arcade", x: 49, y: 13.8 },
        { type: "beanBag", x: 45, y: 18.6, v: 1 },
        { type: "beanBag", x: 46.5, y: 19.2, v: 3 },
        { type: "sofaUp", x: 44.8, y: 20.5, v: 2 },
        { type: "plantBig", x: 37.1, y: 20.4 },
        { type: "plantBig", x: 49.9, y: 20.4 },
      ]),
    );
  } else {
    out.push(
      ...at([
        { type: "lounger", x: 39, y: 13, v: 0 },
        { type: "lounger", x: 41, y: 13, v: 1 },
        { type: "lounger", x: 43, y: 13, v: 0 },
        { type: "speaker", x: 46.9, y: 11.2 },
        { type: "sofaUp", x: 40.5, y: 19.5, v: 1 },
        { type: "plantBig", x: 37.1, y: 20.4 },
        { type: "plantBig", x: 49.9, y: 20.4 },
        { type: "plantSmall", x: 46, y: 16 },
      ]),
    );
  }
  return out;
}

/** Monta o mapa de uma sede personalizada. */
export function generateMap(spec: LayoutSpec): MapData {
  const desks = Math.max(MIN_DESKS, Math.min(MAX_DESKS, Math.round(spec.desks)));
  const top: Block[] = [];
  const bot: Block[] = [{ t: "work", desks, w: workDims(desks).w }];
  if (spec.kitchen) bot.push({ t: "kitchen", w: 7 });
  for (const r of spec.rooms.slice(0, MAX_ROOMS)) {
    const seats = Math.max(1, Math.min(MAX_ROOM_SEATS, Math.round(r.seats)));
    const wt = roomWidth(seats, false);
    const wb = roomWidth(seats, true);
    const T = span(top) + (top.length ? 1 : 0) + wt;
    const B = span(bot) + 1 + wb;
    if (T <= B + 2) top.push({ t: "room", key: r.key, seats, w: wt });
    else bot.push({ t: "room", key: r.key, seats, w: wb });
  }
  const W = Math.max(span(top), span(bot), 14);
  for (const band of [top, bot]) {
    const left = W - span(band);
    if (left <= 0) continue;
    if (!band.length) band.push({ t: "lounge", w: W });
    else if (left >= 6) band.push({ t: "lounge", w: left - 1 });
    else band[band.length - 1].w += left;
  }

  const lazer = spec.pool || spec.games;
  const w = W + 2 + (lazer ? LAZER_W + 1 : 0);
  const h = 24;
  const floor: Floor[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => Floor.Wall));
  const carve = (x1: number, y1: number, x2: number, y2: number, f: Floor) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) floor[y][x] = f;
  };
  const zones: Zone[] = [];
  const items: MapItem[] = [];
  const decor: Record<string, RoomDecorSpot> = {};
  const others: Zone[] = [];
  let spawn = { x: 2.5 * TILE, y: 21.5 * TILE };
  let logo: LogoSpot | null = null;
  let roomIdx = 0;
  let loungeIdx = 0;

  carve(1, 10, W, 11, Floor.Concrete);
  for (const [band, bottom] of [[top, false], [bot, true]] as const) {
    let cursor = 1;
    const y1 = bottom ? BOT_Y1 : TOP_Y1;
    const y2 = bottom ? BOT_Y2 : TOP_Y2;
    const doorY = bottom ? 12 : 9;
    for (const b of band) {
      const x1 = cursor;
      const x2 = x1 + b.w - 1;
      b.x1 = x1;
      cursor += b.w + 1;
      if (b.t === "room") {
        const i = roomIdx++;
        carve(x1, y1, x2, y2, ROOM_FLOORS[i % ROOM_FLOORS.length]);
        carve(x1 + 1, doorY, x1 + 2, doorY, Floor.Door);
        zones.push({
          key: b.key,
          label: `Sala ${i + 1}`,
          kind: "meeting",
          x1,
          y1,
          x2,
          y2,
          defaultCapacity: b.seats,
          door: { x: x1 + 2, y: 11 },
        });
        const pw = plateWidth(b.w, bottom);
        decor[b.key] = { plate: { x: x1 + 3.2 + pw / 2, y: bottom ? 12.45 : 9.45 }, maxW: pw };
        items.push(...roomItems(x1, b.w, bottom, b.seats, i));
      } else if (b.t === "work") {
        carve(x1, y1, x2, y2, Floor.Wood);
        carve(x1 + 1, doorY, x1 + 2, doorY, Floor.Door);
        others.push({ key: "trabalho", label: "Área de trabalho", kind: "work", x1, y1, x2, y2 });
        const wk = workItems(x1, b.w, b.desks);
        items.push(...wk.items);
        spawn = wk.spawn;
        const lw = Math.min(5, b.w - 4.6);
        if (lw >= 2) logo = { x: x1 + 3.4 + lw / 2, y: 12.45, w: lw };
      } else if (b.t === "kitchen") {
        carve(x1, y1, x2, y2, Floor.Kitchen);
        carve(x1 + 3, doorY, x1 + 4, doorY, Floor.Door);
        others.push({ key: "copa", label: "Copa", kind: "kitchen", x1, y1, x2, y2 });
        items.push(...kitchenItems(x1));
      } else {
        const k = loungeIdx++;
        carve(x1, y1, x2, y2, Floor.WoodDark);
        const dx = x1 + Math.floor(b.w / 2) - 1;
        carve(dx, doorY, dx + 1, doorY, Floor.Door);
        others.push({
          key: k ? `convivencia-${k + 1}` : "convivencia",
          label: "Espaço de convivência",
          kind: "lounge",
          x1,
          y1,
          x2,
          y2,
        });
        items.push(...loungeItems(x1, b.w, bottom));
      }
    }
  }

  // Corredor: caixa de som e plantas nas pontas
  items.push({ type: "speaker", x: 1, y: 8.9 }, { type: "plantSmall", x: W - 1, y: 9.8 });

  if (lazer) {
    const lx1 = W + 2;
    const lx2 = lx1 + LAZER_W - 1;
    carve(W + 1, 10, W + 1, 11, Floor.Door);
    if (spec.pool && spec.games) {
      carve(lx1, 1, lx2, 10, Floor.PoolDeck);
      carve(lx1, 11, lx2, 22, Floor.CarpetGame);
    } else carve(lx1, 1, lx2, 22, spec.pool ? Floor.PoolDeck : Floor.CarpetGame);
    if (spec.pool) carve(lx1 + 2, 2, lx1 + 11, 7, Floor.Pool);
    others.push({ key: "lazer", label: "Área de lazer", kind: "lounge", x1: lx1, y1: 1, x2: lx2, y2: 22 });
    items.push(...lazerItems(lx1, spec.pool, spec.games));
  }
  others.push({ key: "corredor", label: "Corredor", kind: "corridor", x1: 1, y1: 10, x2: W + (lazer ? 1 : 0), y2: 11 });

  return { w, h, floor, zones: [...zones, ...others], items, decor, spawn, logo };
}


/** Mapa de uma sede: clássico (spec = null) ou gerado. */
export function buildMap(spec: LayoutSpec | null): MapData {
  return spec ? generateMap(spec) : classicMap();
}

// ---------------------------------------------------------------------------
// Consultas puras sobre um mapa
// ---------------------------------------------------------------------------

export function zoneIn(m: MapData, tx: number, ty: number): Zone | null {
  for (const z of m.zones) {
    if (tx >= z.x1 && tx <= z.x2 && ty >= z.y1 && ty <= z.y2) return z;
  }
  return null;
}

/** Cadeiras (salas de reunião ou mesas de trabalho) do mapa, na ordem dos itens. */
function chairSeats(m: MapData, kind: ZoneKind): Seat[] {
  return m.items.flatMap((it) => {
    if (it.type !== "chair" && it.type !== "chairUp") return [];
    const x = it.x * TILE + 16;
    const y = it.y * TILE + 24;
    const z = zoneIn(m, Math.floor(x / TILE), Math.floor((y - 4) / TILE));
    if (!z || z.kind !== kind) return [];
    return [{ zoneKey: z.key, x, y, dir: it.type === "chairUp" ? ("down" as const) : ("up" as const) }];
  });
}
export const seatsIn = (m: MapData) => chairSeats(m, "meeting");
/** Mesas da área de trabalho (uma cadeira = uma mesa), em ordem fixa. */
export const deskSeatsIn = (m: MapData) => chairSeats(m, "work");
export const meetingZonesIn = (m: MapData) => m.zones.filter((z) => z.kind === "meeting");

// ---------------------------------------------------------------------------
// Mapa atual (cliente): valores "vivos", trocados por applyMap()
// ---------------------------------------------------------------------------

export let MAP: MapData;
export let MAP_W: number;
export let MAP_H: number;
export let WORLD_W: number;
export let WORLD_H: number;
export let FLOOR: Floor[][];
export let ZONES: Zone[];
export let MEETING_ZONES: Zone[];
export let MEETING_ZONE_KEYS: string[];
export let ROOM_DECOR: Record<string, RoomDecorSpot>;
export let LOGO_SPOT: LogoSpot | null;
export let SPAWN: { x: number; y: number };
export let ITEMS: MapItem[];
/** Resolução da grade de colisão em px. */
export const COLL = 8;
export let COLL_W: number;
export let COLL_H: number;
export let SEATS: Seat[];
/**
 * Mesas da área de trabalho (uma cadeira = uma mesa), em ordem fixa.
 * O índice é o que fica salvo como "mesa fixa" da pessoa.
 */
export let DESK_SEATS: Seat[];
export let INTERACTIONS: Interaction[];

let appliedKey = "";
/** Troca o mapa atual (idempotente para a mesma configuração). */
export function applyMap(m: MapData, key = "") {
  if (key && key === appliedKey) return;
  appliedKey = key;
  MAP = m;
  MAP_W = m.w;
  MAP_H = m.h;
  WORLD_W = m.w * TILE;
  WORLD_H = m.h * TILE;
  FLOOR = m.floor;
  ZONES = m.zones;
  MEETING_ZONES = meetingZonesIn(m);
  MEETING_ZONE_KEYS = MEETING_ZONES.map((z) => z.key);
  ROOM_DECOR = m.decor;
  LOGO_SPOT = m.logo;
  SPAWN = m.spawn;
  ITEMS = m.items;
  COLL_W = WORLD_W / COLL;
  COLL_H = WORLD_H / COLL;
  SEATS = seatsIn(m);
  DESK_SEATS = deskSeatsIn(m);
  INTERACTIONS = m.items.flatMap((it) => {
    const info = INTERACT[it.type];
    if (!info) return [];
    return [{ item: it, type: it.type, ...info, ...interactionSpot(it) }];
  });
}

/** Aplica o mapa de uma sede (clássico se spec = null). */
export function applyOfficeMap(spec: LayoutSpec | null) {
  applyMap(buildMap(spec), spec ? JSON.stringify(spec) : "classic");
}

export function isWallTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return FLOOR[ty][tx] === Floor.Wall;
}

export function zoneAtTile(tx: number, ty: number): Zone | null {
  return zoneIn(MAP, tx, ty);
}

export function zoneAtPoint(px: number, py: number): Zone | null {
  return zoneAtTile(Math.floor(px / TILE), Math.floor(py / TILE));
}

export function zoneByKey(key: string): Zone | undefined {
  return ZONES.find((z) => z.key === key);
}

// ---------------------------------------------------------------------------
// Colisão
// ---------------------------------------------------------------------------

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

export function seatsOf(zoneKey: string): Seat[] {
  return SEATS.filter((s) => s.zoneKey === zoneKey);
}

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


/** Está dentro da água da piscina? (pés do personagem, px) */
export function inPool(px: number, py: number): boolean {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor((py - 2) / TILE);
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && FLOOR[ty][tx] === Floor.Pool;
}

applyMap(classicMap(), "classic");
