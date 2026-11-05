"use client";

import { useEffect, useRef, useState } from "react";

/** Fliperama: quebra-tijolos com 3 vidas e recorde salvo neste navegador. */
const W = 480;
const H = 400;
const PAD_W = 80;
const PAD_H = 10;
const R = 6;
const COLS = 10;
const ROWS = 5;
const BRICK_H = 16;
const COLORS = ["#2b6af3", "#5b8def", "#1f9d8a", "#f0a83a", "#e0564c"];
const BEST_KEY = "fredy:fliperama-recorde";

function readBest(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function ArcadeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef(W / 2);
  const keysRef = useRef({ left: false, right: false });
  const [hud, setHud] = useState({ score: 0, lives: 3, over: false, won: false });
  const [best, setBest] = useState(() => (typeof window === "undefined" ? 0 : readBest()));
  const [round, setRound] = useState(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = true;
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = true;
      if (e.key.startsWith("Arrow")) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) keysRef.current.left = false;
      if (["ArrowRight", "d", "D"].includes(e.key)) keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const bw = (W - 20) / COLS;
    const bricks = Array.from({ length: ROWS * COLS }, (_, i) => ({
      x: 10 + (i % COLS) * bw,
      y: 50 + Math.floor(i / COLS) * (BRICK_H + 4),
      alive: true,
      c: COLORS[Math.floor(i / COLS)],
    }));
    let ball = { x: W / 2, y: H - 60, vx: 180, vy: -260, stuck: true };
    let score = 0;
    let lives = 3;
    let over = false;
    let raf = 0;
    let last = performance.now();
    const push = (won = false) => setHud({ score, lives, over, won });

    const loop = (now: number) => {
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      if (keysRef.current.left) padRef.current -= 460 * dt;
      if (keysRef.current.right) padRef.current += 460 * dt;
      padRef.current = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, padRef.current));
      if (!over) {
        if (ball.stuck) {
          ball.x = padRef.current;
          ball.y = H - 30 - R;
        } else {
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (ball.x < R || ball.x > W - R) ball.vx *= -1;
          ball.x = Math.max(R, Math.min(W - R, ball.x));
          if (ball.y < R) {
            ball.y = R;
            ball.vy = Math.abs(ball.vy);
          }
          // raquete
          if (ball.vy > 0 && ball.y > H - 30 - R && ball.y < H - 30 + PAD_H && Math.abs(ball.x - padRef.current) < PAD_W / 2 + R) {
            const off = (ball.x - padRef.current) / (PAD_W / 2);
            const speed = Math.min(520, Math.hypot(ball.vx, ball.vy) * 1.02);
            ball.vx = off * speed * 0.8;
            ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
          }
          // tijolos
          for (const b of bricks) {
            if (!b.alive) continue;
            if (ball.x > b.x - R && ball.x < b.x + bw - 4 + R && ball.y > b.y - R && ball.y < b.y + BRICK_H + R) {
              b.alive = false;
              ball.vy *= -1;
              score += 10;
              push();
              break;
            }
          }
          if (bricks.every((b) => !b.alive)) {
            over = true;
            push(true);
          }
          if (ball.y > H + R) {
            lives--;
            ball = { x: padRef.current, y: H - 60, vx: 180, vy: -260, stuck: true };
            if (lives <= 0) over = true;
            push();
          }
          if (over) {
            setBest((prev) => {
              const nb = Math.max(prev, score);
              try {
                window.localStorage.setItem(BEST_KEY, String(nb));
              } catch {
                /* ignora */
              }
              return nb;
            });
          }
        }
      }
      // desenho
      ctx.fillStyle = "#0b1029";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.c;
        ctx.fillRect(b.x, b.y, bw - 4, BRICK_H);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(b.x, b.y, bw - 4, 3);
      }
      ctx.fillStyle = "#eef2ff";
      ctx.fillRect(padRef.current - PAD_W / 2, H - 30, PAD_W, PAD_H);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
      ctx.fill();
      if (ball.stuck && !over) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Clique ou aperte espaço para lançar", W / 2, H - 70);
      }
      raf = requestAnimationFrame(loop);
    };
    const launch = () => {
      ball.stuck = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        launch();
      }
    };
    cv.addEventListener("pointerdown", launch);
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", launch);
      window.removeEventListener("keydown", onKey);
    };
  }, [round]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    padRef.current = ((e.clientX - r.left) / r.width) * W;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between px-1 text-sm text-white">
        <span>Pontos: {hud.score}</span>
        <span>{"❤️".repeat(Math.max(0, hud.lives))}</span>
        <span className="text-[var(--muted)]">Recorde: {best}</span>
      </div>
      <div className="relative w-full max-w-[480px]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerMove={onPointer}
          className="aspect-[480/400] w-full touch-none rounded-xl"
          aria-label="Fliperama"
        />
        {hud.over && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-center text-white">
            <div>
              <div className="font-pixel text-3xl">{hud.won ? "Zerou! 🕹️" : "Fim de jogo"}</div>
              <div className="mt-1 text-sm">{hud.score} pontos{hud.score >= best && hud.score > 0 ? " · recorde!" : ""}</div>
              <button
                type="button"
                onClick={() => {
                  setHud({ score: 0, lives: 3, over: false, won: false });
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
      <p className="text-xs text-[var(--muted)]">Mouse ou ←/→ para mover. Não deixe a bola cair.</p>
    </div>
  );
}
