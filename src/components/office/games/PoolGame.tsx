"use client";

import { useEffect, useRef, useState } from "react";

/** Sinuca de treino: encaçape as 7 bolas no menor número de tacadas. */
const W = 640;
const H = 340;
const M = 26; // largura da tabela (borda)
const R = 9; // raio da bola
const POCKET = 17;
const FRICTION = 0.988;
const BEST_KEY = "fredy:sinuca-recorde";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: string;
  cue?: boolean;
  in: boolean;
}

const POCKETS = [
  [M, M],
  [W / 2, M - 4],
  [W - M, M],
  [M, H - M],
  [W / 2, H - M + 4],
  [W - M, H - M],
];
const COLORS = ["#f0c419", "#2f6fde", "#e0564c", "#8b5cf6", "#f08a3a", "#1f9d8a", "#151515"];

function rack(): Ball[] {
  const balls: Ball[] = [{ x: W * 0.25, y: H / 2, vx: 0, vy: 0, c: "#f7f5ef", cue: true, in: false }];
  const startX = W * 0.68;
  let i = 0;
  for (let row = 0; row < 4 && i < 7; row++) {
    for (let k = 0; k <= row && i < 7; k++) {
      balls.push({ x: startX + row * (R * 1.8), y: H / 2 + (k - row / 2) * (R * 2.05), vx: 0, vy: 0, c: COLORS[i++], in: false });
    }
  }
  return balls;
}

function readBest(): number | null {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function PoolGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ballsRef = useRef<Ball[]>(rack());
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const [shots, setShots] = useState(0);
  const [potted, setPotted] = useState(0);
  const [best, setBest] = useState<number | null>(() => (typeof window === "undefined" ? null : readBest()));
  const [round, setRound] = useState(0);
  const shotsRef = useRef(0);

  const moving = () => ballsRef.current.some((b) => !b.in && Math.hypot(b.vx, b.vy) > 4);

  const toTable = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (moving()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    aimRef.current = toTable(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimRef.current) aimRef.current = toTable(e);
  };
  const onUp = () => {
    const aim = aimRef.current;
    aimRef.current = null;
    const cue = ballsRef.current[0];
    if (!aim || cue.in || moving()) return;
    // puxa para trás: a tacada vai na direção oposta ao arraste
    const dx = cue.x - aim.x;
    const dy = cue.y - aim.y;
    const dist = Math.min(160, Math.hypot(dx, dy));
    if (dist < 8) return;
    const power = dist * 7;
    cue.vx = (dx / Math.hypot(dx, dy)) * power;
    cue.vy = (dy / Math.hypot(dx, dy)) * power;
    shotsRef.current++;
    setShots(shotsRef.current);
  };

  useEffect(() => {
    ballsRef.current = rack();
    shotsRef.current = 0;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let shownPotted = -1;
    let finished = false;

    const physics = (dt: number) => {
      const balls = ballsRef.current;
      for (const b of balls) {
        if (b.in) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= Math.pow(FRICTION, dt * 60);
        b.vy *= Math.pow(FRICTION, dt * 60);
        if (Math.hypot(b.vx, b.vy) < 4) b.vx = b.vy = 0;
        // caçapas
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < POCKET) {
            b.in = true;
            b.vx = b.vy = 0;
          }
        }
        if (b.in) continue;
        // tabelas
        if (b.x < M + R) {
          b.x = M + R;
          b.vx = Math.abs(b.vx) * 0.85;
        }
        if (b.x > W - M - R) {
          b.x = W - M - R;
          b.vx = -Math.abs(b.vx) * 0.85;
        }
        if (b.y < M + R) {
          b.y = M + R;
          b.vy = Math.abs(b.vy) * 0.85;
        }
        if (b.y > H - M - R) {
          b.y = H - M - R;
          b.vy = -Math.abs(b.vy) * 0.85;
        }
      }
      // colisões entre bolas (elásticas, massas iguais)
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
          a.vx -= rel * nx;
          a.vy -= rel * ny;
          b.vx += rel * nx;
          b.vy += rel * ny;
        }
      }
      // bola branca caiu: volta para o lugar
      const cue = balls[0];
      if (cue.in && !moving()) Object.assign(cue, { in: false, x: W * 0.25, y: H / 2, vx: 0, vy: 0 });
    };

    const draw = () => {
      ctx.fillStyle = "#5c3820";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#7a4a2b";
      ctx.fillRect(4, 4, W - 8, H - 8);
      ctx.fillStyle = "#1f7a4d";
      ctx.fillRect(M, M, W - 2 * M, H - 2 * M);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(W * 0.25, M, 1, H - 2 * M);
      for (const [px, py] of POCKETS) {
        ctx.fillStyle = "#0b0b0b";
        ctx.beginPath();
        ctx.arc(px, py, POCKET - 3, 0, Math.PI * 2);
        ctx.fill();
      }
      const balls = ballsRef.current;
      for (const b of balls) {
        if (b.in) continue;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 2, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.c;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(b.x - 3, b.y - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // mira e taco
      const aim = aimRef.current;
      const cue = balls[0];
      if (aim && !cue.in) {
        const dx = cue.x - aim.x;
        const dy = cue.y - aim.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = Math.min(160, d);
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + (dx / d) * 260, cue.y + (dy / d) * 260);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#d8b07a";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cue.x - (dx / d) * (R + 4 + pull * 0.4), cue.y - (dy / d) * (R + 4 + pull * 0.4));
        ctx.lineTo(cue.x - (dx / d) * (R + 180 + pull * 0.4), cue.y - (dy / d) * (R + 180 + pull * 0.4));
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(M + 6, H - M - 12, (pull / 160) * 120, 6);
      }
      const n = balls.filter((b) => !b.cue && b.in).length;
      if (n !== shownPotted) {
        shownPotted = n;
        setPotted(n);
      }
      if (n === 7 && !finished && !moving()) {
        finished = true;
        const s = shotsRef.current;
        setBest((prev) => {
          const nb = prev === null || s < prev ? s : prev;
          try {
            window.localStorage.setItem(BEST_KEY, String(nb));
          } catch {
            /* ignora */
          }
          return nb;
        });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.025, (now - last) / 1000);
      last = now;
      // sub-passos para não atravessar bolas em tacadas fortes
      for (let i = 0; i < 4; i++) physics(dt / 4);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [round]);

  const done = potted === 7;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between px-1 text-sm text-white">
        <span>Bolas: {potted}/7</span>
        <span>Tacadas: {shots}</span>
        <span className="text-[var(--muted)]">Recorde: {best ?? "—"}</span>
      </div>
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          className="aspect-[640/340] w-full cursor-crosshair touch-none rounded-xl"
          aria-label="Mesa de sinuca"
        />
        {done && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/55 text-center text-white">
            <div>
              <div className="font-pixel text-3xl">Mesa limpa! 🎱</div>
              <div className="mt-1 text-sm">{shots} tacadas{best === shots ? " · novo recorde!" : ""}</div>
              <button
                type="button"
                onClick={() => {
                  setShots(0);
                  setPotted(0);
                  setRound((r) => r + 1);
                }}
                className="btn-primary mt-3 h-10 px-5"
              >
                Jogar de novo
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">Clique perto da bola branca e arraste para trás: quanto mais longe, mais forte. Solte para tacar.</p>
    </div>
  );
}
