"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pingue-pongue e totó (mesma física, visual diferente).
 * - "cpu": você contra o computador.
 * - "host": você à esquerda; seu navegador simula a partida e envia o estado.
 * - "guest": você à direita; recebe o estado e envia a posição da sua raquete.
 */
export type PaddleRole = "cpu" | "host" | "guest";

export interface PaddleNet {
  sendState: (s: number[]) => void;
  sendPaddle: (y: number) => void;
  /** Registra quem recebe estado (guest) e raquete (host). Devolve a função para remover. */
  listen: (h: { onState?: (s: number[]) => void; onPaddle?: (y: number) => void }) => () => void;
}

const W = 640;
const H = 380;
const PAD_H = 70;
const PAD_W = 10;
const BALL = 8;
const WIN = 7;

interface State {
  bx: number;
  by: number;
  vx: number;
  vy: number;
  p1: number;
  p2: number;
  s1: number;
  s2: number;
  over: number;
}

function fresh(dir = 1): State {
  return { bx: W / 2, by: H / 2, vx: 280 * dir, vy: (Math.random() * 2 - 1) * 160, p1: H / 2, p2: H / 2, s1: 0, s2: 0, over: 0 };
}

export function PaddleGame({
  theme,
  role,
  myName,
  opponentName,
  net,
}: {
  theme: "pingpong" | "foosball";
  role: PaddleRole;
  myName: string;
  opponentName: string;
  net: PaddleNet | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(fresh());
  const myYRef = useRef(H / 2);
  const keysRef = useRef({ up: false, down: false });
  const [score, setScore] = useState({ s1: 0, s2: 0, over: 0 });
  const [round, setRound] = useState(0);

  // Teclado (W/S ou setas) e mouse/toque sobre a mesa.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) keysRef.current.up = true;
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.down = true;
      if (e.key.startsWith("Arrow")) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (["ArrowUp", "w", "W"].includes(e.key)) keysRef.current.up = false;
      if (["ArrowDown", "s", "S"].includes(e.key)) keysRef.current.down = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    myYRef.current = ((e.clientY - r.top) / r.height) * H;
  };

  // Rede: o host recebe a raquete do guest; o guest recebe o estado.
  useEffect(() => {
    if (!net || role === "cpu") return;
    return net.listen({
      onPaddle: (y) => {
        if (role === "host") stRef.current.p2 = y;
      },
      onState: (s) => {
        if (role !== "guest") return;
        const st = stRef.current;
        [st.bx, st.by, st.p1, , st.s1, st.s2, st.over] = s;
      },
    });
  }, [net, role]);

  // Laço do jogo.
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    stRef.current = fresh(Math.random() < 0.5 ? 1 : -1);
    let raf = 0;
    let last = performance.now();
    let sendAcc = 0;
    let lastSentPaddle = -1;
    let shownScore = "";

    const clampPad = (y: number) => Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, y));

    const step = (dt: number) => {
      const st = stRef.current;
      // minha raquete
      if (keysRef.current.up) myYRef.current -= 420 * dt;
      if (keysRef.current.down) myYRef.current += 420 * dt;
      myYRef.current = clampPad(myYRef.current);
      if (role === "guest") {
        st.p2 = myYRef.current;
        return; // quem simula é o host
      }
      st.p1 = myYRef.current;
      if (role === "cpu") {
        const target = st.vx > 0 ? st.by : H / 2;
        st.p2 += Math.max(-300 * dt, Math.min(300 * dt, target - st.p2));
      }
      st.p2 = clampPad(st.p2);
      if (st.over) return;
      const prevX = st.bx;
      st.bx += st.vx * dt;
      st.by += st.vy * dt;
      if (st.by < BALL) {
        st.by = BALL;
        st.vy = Math.abs(st.vy);
      }
      if (st.by > H - BALL) {
        st.by = H - BALL;
        st.vy = -Math.abs(st.vy);
      }
      // Colisão "varrida": confere se a bola cruzou a face da raquete neste passo
      // (com a bola rápida ela andaria mais que a espessura da raquete por quadro).
      const hit = (px: number, py: number, dir: 1 | -1) => {
        const face = px + dir * (PAD_W / 2 + BALL);
        const crossed = dir === 1 ? prevX >= face && st.bx <= face : prevX <= face && st.bx >= face;
        if (crossed && Math.abs(st.by - py) <= PAD_H / 2 + BALL) {
          const off = (st.by - py) / (PAD_H / 2);
          const speed = Math.min(720, Math.hypot(st.vx, st.vy) * 1.06);
          st.vx = dir * Math.max(240, speed * 0.85);
          st.vy = off * speed * 0.75;
          st.bx = px + dir * (PAD_W / 2 + BALL + 1);
        }
      };
      if (st.vx < 0) hit(28, st.p1, 1);
      if (st.vx > 0) hit(W - 28, st.p2, -1);
      if (st.bx < -BALL || st.bx > W + BALL) {
        if (st.bx < 0) st.s2++;
        else st.s1++;
        const dir = st.bx < 0 ? -1 : 1;
        Object.assign(st, { bx: W / 2, by: H / 2, vx: 260 * dir, vy: (Math.random() * 2 - 1) * 160 });
        if (st.s1 >= WIN || st.s2 >= WIN) st.over = 1;
      }
    };

    const draw = () => {
      const st = stRef.current;
      if (theme === "pingpong") {
        ctx.fillStyle = "#1f5f9e";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, W - 12, H - 12);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(6, H / 2);
        ctx.lineTo(W - 6, H / 2);
        ctx.stroke();
        ctx.fillStyle = "#d9d9d9";
        ctx.fillRect(W / 2 - 2, 0, 4, H);
      } else {
        ctx.fillStyle = "#2e8a52";
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#2a7f4b" : "#2e8a52";
          ctx.fillRect((i * W) / 8, 0, W / 8, H);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, W - 12, H - 12);
        ctx.beginPath();
        ctx.moveTo(W / 2, 6);
        ctx.lineTo(W / 2, H - 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(0, H / 2 - 60, 8, 120);
        ctx.fillRect(W - 8, H / 2 - 60, 8, 120);
      }
      // raquetes / bonecos
      const paddle = (x: number, y: number, c: string) => {
        if (theme === "pingpong") {
          ctx.fillStyle = c;
          ctx.fillRect(x - PAD_W / 2, y - PAD_H / 2, PAD_W, PAD_H);
        } else {
          ctx.fillStyle = "#c9d1d9";
          ctx.fillRect(x - 1, 0, 2, H);
          ctx.fillStyle = c;
          for (const dy of [-PAD_H / 2 + 8, 0, PAD_H / 2 - 8]) ctx.fillRect(x - 7, y + dy - 7, 14, 14);
        }
      };
      paddle(28, st.p1, "#e0564c");
      paddle(W - 28, st.p2, "#2b6af3");
      ctx.fillStyle = theme === "pingpong" ? "#ffb04a" : "#ffffff";
      ctx.beginPath();
      ctx.arc(st.bx, st.by, BALL, 0, Math.PI * 2);
      ctx.fill();
      const key = `${st.s1}-${st.s2}-${st.over}`;
      if (key !== shownScore) {
        shownScore = key;
        setScore({ s1: st.s1, s2: st.s2, over: st.over });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      sendAcc += dt;
      if (net && sendAcc >= 0.066) {
        sendAcc = 0;
        const st = stRef.current;
        if (role === "host") net.sendState([Math.round(st.bx), Math.round(st.by), Math.round(st.p1), Math.round(st.p2), st.s1, st.s2, st.over]);
        if (role === "guest" && Math.abs(myYRef.current - lastSentPaddle) > 1) {
          lastSentPaddle = myYRef.current;
          net.sendPaddle(Math.round(myYRef.current));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [theme, role, net, round]);

  const left = role === "guest" ? opponentName : myName;
  const right = role === "guest" ? myName : role === "cpu" ? "Computador" : opponentName;
  const iWon = score.over && ((role !== "guest" && score.s1 > score.s2) || (role === "guest" && score.s2 > score.s1));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex w-full items-center justify-between px-1 text-sm text-white">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#e0564c]" /> {left}
        </span>
        <span className="font-pixel text-2xl tabular-nums">
          {score.s1} × {score.s2}
        </span>
        <span className="flex items-center gap-2">
          {right} <span className="h-3 w-3 rounded-sm bg-[#2b6af3]" />
        </span>
      </div>
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          className="aspect-[640/380] w-full touch-none rounded-xl"
          aria-label={theme === "pingpong" ? "Mesa de pingue-pongue" : "Mesa de totó"}
        />
        {score.over ? (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/55">
            <div className="text-center text-white">
              <div className="font-pixel text-3xl">{iWon ? "Você venceu! 🏆" : "Não foi dessa vez"}</div>
              {role !== "guest" && (
                <button type="button" onClick={() => setRound((r) => r + 1)} className="btn-primary mt-3 h-10 px-5">
                  Jogar de novo
                </button>
              )}
              {role === "guest" && <div className="mt-2 text-sm text-[var(--muted)]">Aguardando o anfitrião recomeçar…</div>}
            </div>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-[var(--muted)]">Mova o mouse sobre a mesa ou use W/S (↑/↓). Quem fizer {WIN} pontos vence.</p>
    </div>
  );
}
