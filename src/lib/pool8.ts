/**
 * Sinuca "8 ball" para 2 pessoas: física, regras e linhas de mira (funções puras).
 * Bola 0 = branca; 1–7 lisas; 8 preta; 9–15 listradas.
 */

export const W = 640;
export const H = 340;
/** Largura da tabela (borda de madeira). */
export const M = 26;
export const R = 9;
export const POCKET = 17;
const FRICTION = 0.988; // por 1/60 s
const STOP = 4; // px/s
export const MAX_SPEED = 1150;
export const HEAD_X = W * 0.25;
export const FOOT = { x: W * 0.7, y: H / 2 };

export const POCKETS: [number, number][] = [
  [M, M],
  [W / 2, M - 4],
  [W - M, M],
  [M, H - M],
  [W / 2, H - M + 4],
  [W - M, H - M],
];

export const BALL_COLORS = ["#f7f5ef", "#f0c419", "#2f6fde", "#e0564c", "#7c4dce", "#f08a3a", "#1f9d6a", "#8a2b2b", "#151515"];
export const colorOf = (n: number) => BALL_COLORS[n > 8 ? n - 8 : n];

export type Group = "solids" | "stripes";
export const groupOf = (n: number): Group | null => (n >= 1 && n <= 7 ? "solids" : n >= 9 && n <= 15 ? "stripes" : null);
export const groupLabel = (g: Group) => (g === "solids" ? "lisas" : "listradas");

export interface Ball {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  in: boolean;
}

export interface PoolState {
  balls: Ball[];
  /** De quem é a vez (0 = quem chegou primeiro e quebra; 1 = adversário). */
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  /** Bola na mão: quem joga pode reposicionar a branca. */
  inHand: boolean;
  broken: boolean;
  winner: 0 | 1 | null;
  msg: string;
  shot: number;
}

/** Triângulo com a 8 no meio, uma lisa e uma listrada nos cantos de trás. */
export function rack(): Ball[] {
  // Linha a linha: [1] [9 2] [10 8 3] [11 4 12 5] [6 13 7 14 15] — 8 no centro e cantos de trás de grupos diferentes.
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 6, 13, 7, 14, 15];
  const balls: Ball[] = [{ n: 0, x: HEAD_X, y: H / 2, vx: 0, vy: 0, in: false }];
  let i = 0;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      balls.push({
        n: order[i++],
        x: FOOT.x + row * (R * 1.75),
        y: H / 2 + (k - row / 2) * (R * 2.02),
        vx: 0,
        vy: 0,
        in: false,
      });
    }
  }
  return balls;
}

export function newGame(breaker: 0 | 1 = 0): PoolState {
  return { balls: rack(), turn: breaker, groups: [null, null], inHand: false, broken: false, winner: null, msg: "", shot: 0 };
}

export const isMoving = (balls: Ball[]) => balls.some((b) => !b.in && (b.vx !== 0 || b.vy !== 0));

/** Registro do que aconteceu na tacada (para as regras). */
export interface ShotLog {
  firstHit: number | null;
  potted: number[];
}

/** Avança a física em `dt` segundos (use passos pequenos). */
export function step(balls: Ball[], dt: number, log?: ShotLog) {
  const f = Math.pow(FRICTION, dt * 60);
  for (const b of balls) {
    if (b.in) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= f;
    b.vy *= f;
    if (Math.hypot(b.vx, b.vy) < STOP) b.vx = b.vy = 0;
    for (const [px, py] of POCKETS) {
      if (Math.hypot(b.x - px, b.y - py) < POCKET) {
        b.in = true;
        b.vx = b.vy = 0;
        log?.potted.push(b.n);
        break;
      }
    }
    if (b.in) continue;
    if (b.x < M + R) {
      b.x = M + R;
      b.vx = Math.abs(b.vx) * 0.85;
    } else if (b.x > W - M - R) {
      b.x = W - M - R;
      b.vx = -Math.abs(b.vx) * 0.85;
    }
    if (b.y < M + R) {
      b.y = M + R;
      b.vy = Math.abs(b.vy) * 0.85;
    } else if (b.y > H - M - R) {
      b.y = H - M - R;
      b.vy = -Math.abs(b.vy) * 0.85;
    }
  }
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i];
      const b = balls[j];
      if (a.in || b.in) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= R * 2) continue;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = R * 2 - d;
      a.x -= (nx * overlap) / 2;
      a.y -= (ny * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.y += (ny * overlap) / 2;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      if (log && log.firstHit === null) {
        if (a.n === 0) log.firstHit = b.n;
        else if (b.n === 0) log.firstHit = a.n;
      }
      a.vx -= rel * nx;
      a.vy -= rel * ny;
      b.vx += rel * nx;
      b.vy += rel * ny;
    }
  }
}

/** Simula até tudo parar (usado nos testes e como garantia). */
export function simulate(balls: Ball[], log: ShotLog, maxSeconds = 20) {
  const dt = 1 / 240;
  for (let t = 0; t < maxSeconds && isMoving(balls); t += dt) step(balls, dt, log);
}

export function strike(balls: Ball[], angle: number, power: number) {
  const cue = balls[0];
  const v = 60 + Math.max(0, Math.min(1, power)) * (MAX_SPEED - 60);
  cue.vx = Math.cos(angle) * v;
  cue.vy = Math.sin(angle) * v;
}

/** Posição livre para a branca (dentro da mesa e sem encostar em outra bola)? */
export function canPlaceCue(balls: Ball[], x: number, y: number) {
  if (x < M + R || x > W - M - R || y < M + R || y > H - M - R) return false;
  if (POCKETS.some(([px, py]) => Math.hypot(x - px, y - py) < POCKET + R)) return false;
  return balls.every((b) => b.n === 0 || b.in || Math.hypot(b.x - x, b.y - y) >= R * 2 + 0.5);
}

/** Recoloca a bola num ponto livre perto do alvo (para a 8 na quebra e a branca após falta). */
function spot(balls: Ball[], ball: Ball, x: number, y: number) {
  for (let r = 0; r < 200; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (canPlaceCue(balls.filter((b) => b !== ball), px, py)) {
        Object.assign(ball, { x: px, y: py, vx: 0, vy: 0, in: false });
        return;
      }
      if (r === 0) break;
    }
  }
}

const remaining = (balls: Ball[], g: Group) => balls.filter((b) => !b.in && groupOf(b.n) === g).length;

/**
 * Aplica as regras depois que as bolas pararam. `before` = grupos limpos antes da tacada.
 * Devolve o novo estado (não muda o original).
 */
export function resolveShot(prev: PoolState, after: Ball[], log: ShotLog, names: [string, string]): PoolState {
  const shooter = prev.turn;
  const other = (1 - shooter) as 0 | 1;
  const balls = after.map((b) => ({ ...b, vx: 0, vy: 0 }));
  const groups: [Group | null, Group | null] = [...prev.groups];
  const isBreak = !prev.broken;
  const mine = groups[shooter];
  const clearedBefore = mine ? prev.balls.filter((b) => !b.in && groupOf(b.n) === mine).length === 0 : false;
  const scratch = log.potted.includes(0);
  const eight = log.potted.includes(8);
  const pottedObj = log.potted.filter((n) => n !== 0 && n !== 8);
  const N = names[shooter];

  const done = (winner: 0 | 1, msg: string): PoolState => ({
    ...prev,
    balls,
    groups,
    inHand: false,
    broken: true,
    winner,
    msg,
    shot: prev.shot + 1,
  });

  // Bola 8
  if (eight) {
    if (isBreak) {
      spot(balls, balls.find((b) => b.n === 8)!, FOOT.x, FOOT.y);
    } else if (mine && clearedBefore && !scratch && log.firstHit === 8) {
      return done(shooter, `${N} encaçapou a 8 e venceu! 🎱`);
    } else {
      return done(other, scratch ? `${N} encaçapou a 8 junto com a branca e perdeu.` : `${N} encaçapou a 8 antes da hora e perdeu.`);
    }
  }

  // Faltas
  let foul: string | null = null;
  if (scratch) foul = "a branca caiu";
  else if (log.firstHit === null) foul = "não acertou nenhuma bola";
  else if (mine) {
    const legal = clearedBefore ? log.firstHit === 8 : groupOf(log.firstHit) === mine;
    if (!legal) foul = clearedBefore ? "tinha que acertar a 8 primeiro" : "acertou primeiro a bola do adversário";
  } else if (log.firstHit === 8 && !isBreak) foul = "acertou a 8 primeiro";

  if (scratch) {
    const cue = balls[0];
    cue.in = false;
    spot(balls, cue, HEAD_X, H / 2);
  }

  // Grupos: mesa aberta + encaçapou de forma limpa (fora da quebra) = fica com o grupo da primeira bola.
  let assigned = "";
  if (!mine && !foul && !isBreak && pottedObj.length) {
    const g = groupOf(pottedObj[0])!;
    groups[shooter] = g;
    groups[other] = g === "solids" ? "stripes" : "solids";
    assigned = `${N} fica com as ${groupLabel(g)}. `;
  }
  const myGroup = groups[shooter];
  const pottedMine = myGroup ? pottedObj.some((n) => groupOf(n) === myGroup) : pottedObj.length > 0;
  const keep = !foul && pottedMine;
  const next = keep ? shooter : other;

  let msg: string;
  if (foul) msg = `Falta: ${N} ${foul}. Bola na mão para ${names[other]}.`;
  else if (keep) msg = `${assigned}${N} continua.`;
  else msg = `${assigned}Vez de ${names[other]}.`;
  if (myGroup && remaining(balls, myGroup) === 0 && keep) msg = `${assigned}${N} limpou as ${groupLabel(myGroup)}: agora é a 8!`;

  return { ...prev, balls, groups, turn: next, inHand: Boolean(foul), broken: true, winner: null, msg, shot: prev.shot + 1 };
}

// ---------------------------------------------------------------------------
// Linhas de mira (como nos jogos de sinuca): caminho da branca, bola fantasma,
// direção da bola atingida e desvio da branca.
// ---------------------------------------------------------------------------
export interface AimGuide {
  /** Ponto onde a branca para de andar reto (contato ou tabela). */
  end: { x: number; y: number };
  /** Bola atingida (se houver). */
  target: Ball | null;
  /** Direção da bola atingida (unitária). */
  targetDir: { x: number; y: number } | null;
  /** Desvio da branca depois do contato (unitário) ou reflexão na tabela. */
  cueDir: { x: number; y: number } | null;
}

export function aimGuide(balls: Ball[], angle: number): AimGuide {
  const cue = balls[0];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Primeiro contato com bola: |c + t d - b| = 2R
  let best = Infinity;
  let target: Ball | null = null;
  for (const b of balls) {
    if (b.n === 0 || b.in) continue;
    const ox = cue.x - b.x;
    const oy = cue.y - b.y;
    const bq = ox * dx + oy * dy;
    const c = ox * ox + oy * oy - 4 * R * R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < best) {
      best = t;
      target = b;
    }
  }
  // Tabela
  const tx = dx > 0 ? (W - M - R - cue.x) / dx : dx < 0 ? (M + R - cue.x) / dx : Infinity;
  const ty = dy > 0 ? (H - M - R - cue.y) / dy : dy < 0 ? (M + R - cue.y) / dy : Infinity;
  const wall = Math.min(tx, ty);
  if (target && best <= wall) {
    const gx = cue.x + dx * best;
    const gy = cue.y + dy * best;
    const nx = (target.x - gx) / (2 * R);
    const ny = (target.y - gy) / (2 * R);
    const dot = dx * nx + dy * ny;
    const cx = dx - dot * nx;
    const cy = dy - dot * ny;
    const cl = Math.hypot(cx, cy);
    return { end: { x: gx, y: gy }, target, targetDir: { x: nx, y: ny }, cueDir: cl > 0.05 ? { x: cx / cl, y: cy / cl } : null };
  }
  const ex = cue.x + dx * wall;
  const ey = cue.y + dy * wall;
  return { end: { x: ex, y: ey }, target: null, targetDir: null, cueDir: { x: tx < ty ? -dx : dx, y: tx < ty ? dy : -dy } };
}
