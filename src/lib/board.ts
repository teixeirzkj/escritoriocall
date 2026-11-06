/**
 * Quadro branco da reunião. Os traços circulam no canal do escritório (evento "board")
 * marcados com a sala; quem chega pede uma cópia a quem já está dentro.
 */

/** Tamanho lógico do quadro (os pontos são inteiros nesse espaço). */
export const BOARD_W = 1600;
export const BOARD_H = 900;
export const MAX_POINTS = 1200;
export const MAX_STROKES = 1500;

export interface Stroke {
  id: string;
  /** Quem desenhou. */
  by: string;
  /** Cor (hex). "eraser" apaga. */
  c: string;
  /** Espessura no espaço lógico. */
  w: number;
  /** x0,y0,x1,y1,... */
  p: number[];
}

export type BoardMsg =
  | { k: "open"; room: string }
  | { k: "close"; room: string }
  | { k: "stroke"; room: string; s: Stroke }
  | { k: "undo"; room: string; id: string }
  | { k: "clear"; room: string }
  | { k: "req"; room: string }
  | { k: "sync"; room: string; to: string; open: boolean; strokes: Stroke[] };

export interface BoardState {
  open: boolean;
  strokes: Stroke[];
}

export const EMPTY_BOARD: BoardState = { open: false, strokes: [] };

function validStroke(s: unknown): s is Stroke {
  if (!s || typeof s !== "object") return false;
  const v = s as Stroke;
  return (
    typeof v.id === "string" &&
    v.id.length <= 64 &&
    typeof v.by === "string" &&
    typeof v.c === "string" &&
    v.c.length <= 16 &&
    typeof v.w === "number" &&
    Array.isArray(v.p) &&
    v.p.length <= MAX_POINTS * 2 &&
    v.p.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Insere ou atualiza um traço (o desenho vai chegando aos pedaços). */
function upsert(strokes: Stroke[], s: Stroke) {
  const i = strokes.findIndex((x) => x.id === s.id);
  if (i < 0) return strokes.length >= MAX_STROKES ? strokes : [...strokes, s];
  if (strokes[i].p.length >= s.p.length) return strokes;
  const next = strokes.slice();
  next[i] = s;
  return next;
}

/**
 * Aplica uma mensagem recebida ao quadro. `from` é o clientId do Ably (não pode ser forjado):
 * só o autor mexe no próprio traço.
 */
export function applyBoard(state: BoardState, from: string, msg: BoardMsg, myId: string): BoardState {
  switch (msg.k) {
    case "open":
      return state.open ? state : { ...state, open: true };
    case "close":
      return state.open ? { ...state, open: false } : state;
    case "stroke":
      if (!validStroke(msg.s) || msg.s.by !== from) return state;
      return { ...state, strokes: upsert(state.strokes, msg.s) };
    case "undo":
      return { ...state, strokes: state.strokes.filter((s) => !(s.id === msg.id && s.by === from)) };
    case "clear":
      return { ...state, strokes: [] };
    case "sync": {
      if (msg.to !== myId || !Array.isArray(msg.strokes)) return state;
      let strokes = state.strokes;
      for (const s of msg.strokes) if (validStroke(s)) strokes = upsert(strokes, s);
      return { open: state.open || Boolean(msg.open), strokes };
    }
    default:
      return state;
  }
}

/**
 * Quem responde ao pedido de cópia: a pessoa de menor id na sala (fora quem pediu).
 * Assim só uma resposta é enviada.
 */
export function isSyncResponder(myId: string, requester: string, roomMembers: string[]) {
  const candidates = roomMembers.filter((id) => id !== requester).sort();
  return candidates[0] === myId;
}

/** Divide os traços em pacotes que cabem numa mensagem do Ably (limite de 64 KB). */
export function chunkStrokes(strokes: Stroke[], maxBytes = 48_000): Stroke[][] {
  const out: Stroke[][] = [];
  let cur: Stroke[] = [];
  let size = 0;
  for (const s of strokes) {
    const n = JSON.stringify(s).length;
    if (cur.length && size + n > maxBytes) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
