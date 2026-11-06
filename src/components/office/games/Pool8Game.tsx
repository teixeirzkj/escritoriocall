"use client";

import { RotateCcw, Target } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  aimGuide,
  type Ball,
  canPlaceCue,
  colorOf,
  type Group,
  groupLabel,
  groupOf,
  H,
  isMoving,
  M,
  newGame,
  POCKETS,
  POCKET,
  type PoolState,
  R,
  resolveShot,
  type ShotLog,
  step,
  strike,
  W,
} from "@/lib/pool8";

/** Mensagens da sinuca entre os dois jogadores. */
export type PoolWire =
  | { t: "hello" }
  | { t: "aim"; a: number }
  | { t: "place"; x: number; y: number }
  | { t: "shot"; a: number; p: number; cx: number; cy: number }
  | { t: "sync"; st: PoolState };

export interface PoolNet {
  send: (d: PoolWire) => void;
  listen: (h: (d: unknown) => void) => () => void;
}

const clone = (balls: Ball[]) => balls.map((b) => ({ ...b }));

function isWire(d: unknown): d is PoolWire {
  return Boolean(d) && typeof d === "object" && typeof (d as { t?: unknown }).t === "string";
}

/**
 * Sinuca 8 ball para 2 pessoas (ou treino sozinho).
 * Quem tacou simula, aplica as regras e manda o estado final; o outro anima a mesma tacada
 * e depois alinha com o estado recebido.
 */
export function Pool8Game({
  role,
  myName,
  opponentName,
  net,
}: {
  role: "host" | "guest" | "solo";
  myName: string;
  opponentName: string;
  net: PoolNet | null;
}) {
  const me: 0 | 1 = role === "guest" ? 1 : 0;
  const solo = role === "solo" || !net;
  const names: [string, string] = solo ? [myName, myName] : role === "host" ? [myName, opponentName] : [opponentName, myName];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initial] = useState(() => newGame(0));
  const stateRef = useRef<PoolState>(initial);
  const ballsRef = useRef<Ball[]>(clone(initial.balls));
  const simRef = useRef<{ who: "me" | "remote"; log: ShotLog } | null>(null);
  const pendingRef = useRef<{ st: PoolState; at: number } | null>(null);
  const aimRef = useRef(0);
  const oppAimRef = useRef<number | null>(null);
  const powerRef = useRef(0.55);
  const dragRef = useRef<"aim" | "cue" | null>(null);
  const lastSendRef = useRef(0);
  const [power, setPower] = useState(0.55);
  const [ui, setUi] = useState(() => ({ ...initial, moving: false }));

  const myTurn = ui.turn === me;
  const canAct = (myTurn || solo) && ui.winner === null && !ui.moving;

  const publish = useCallback(() => {
    setUi({ ...stateRef.current, moving: Boolean(simRef.current) });
  }, []);

  const applyState = useCallback(
    (st: PoolState) => {
      stateRef.current = st;
      ballsRef.current = clone(st.balls);
      simRef.current = null;
      pendingRef.current = null;
      oppAimRef.current = null;
      publish();
    },
    [publish],
  );

  // Rede
  useEffect(() => {
    if (!net) return;
    const off = net.listen((d) => {
      if (!isWire(d)) return;
      if (d.t === "hello" && role === "host") net.send({ t: "sync", st: stateRef.current });
      else if (d.t === "aim" && typeof d.a === "number") oppAimRef.current = d.a;
      else if (d.t === "place" && !simRef.current) {
        const cue = ballsRef.current[0];
        if (canPlaceCue(ballsRef.current, d.x, d.y)) {
          cue.x = d.x;
          cue.y = d.y;
          stateRef.current.balls[0].x = d.x;
          stateRef.current.balls[0].y = d.y;
        }
      } else if (d.t === "shot" && !simRef.current) {
        const balls = clone(stateRef.current.balls);
        balls[0].x = d.cx;
        balls[0].y = d.cy;
        strike(balls, d.a, d.p);
        ballsRef.current = balls;
        simRef.current = { who: "remote", log: { firstHit: null, potted: [] } };
        oppAimRef.current = null;
        publish();
      } else if (d.t === "sync" && d.st && Array.isArray(d.st.balls)) {
        if (simRef.current?.who === "remote") pendingRef.current = { st: d.st, at: performance.now() };
        else applyState(d.st);
      }
    });
    if (role === "guest") net.send({ t: "hello" });
    return off;
  }, [net, role, applyState, publish]);

  const shoot = useCallback(() => {
    if (simRef.current || stateRef.current.winner !== null) return;
    if (!solo && stateRef.current.turn !== me) return;
    const balls = clone(stateRef.current.balls);
    const a = aimRef.current;
    const p = powerRef.current;
    net?.send({ t: "shot", a, p, cx: balls[0].x, cy: balls[0].y });
    strike(balls, a, p);
    ballsRef.current = balls;
    simRef.current = { who: "me", log: { firstHit: null, potted: [] } };
    publish();
  }, [me, net, solo, publish]);

  // Mira para o adversário: no máximo ~10 envios por segundo, sempre mandando a posição final.
  const aimTimerRef = useRef<number | null>(null);
  const sendAim = (a: number) => {
    if (!net || solo) return;
    const now = performance.now();
    const wait = 90 - (now - lastSendRef.current);
    if (wait <= 0) {
      lastSendRef.current = now;
      net.send({ t: "aim", a });
    } else if (aimTimerRef.current === null) {
      aimTimerRef.current = window.setTimeout(() => {
        aimTimerRef.current = null;
        lastSendRef.current = performance.now();
        net.send({ t: "aim", a: aimRef.current });
      }, wait);
    }
  };
  useEffect(
    () => () => {
      if (aimTimerRef.current !== null) window.clearTimeout(aimTimerRef.current);
    },
    [],
  );

  // Teclado: setas giram a mira (Shift = mais rápido), espaço taca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        aimRef.current += (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 0.04 : 0.006);
        sendAim(aimRef.current);
      } else if (e.key === " ") {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shoot]);

  // Física + desenho
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    let last = performance.now();

    const finishIfStopped = () => {
      const sim = simRef.current;
      if (!sim || isMoving(ballsRef.current)) return;
      if (sim.who === "me") {
        let st = resolveShot(stateRef.current, ballsRef.current, sim.log, names);
        if (solo) st = { ...st, turn: 0 };
        simRef.current = null;
        stateRef.current = st;
        ballsRef.current = clone(st.balls);
        net?.send({ t: "sync", st });
        publish();
      } else if (pendingRef.current) {
        applyState(pendingRef.current.st);
      }
    };

    const drawBall = (b: Ball) => {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.arc(b.x + 1.8, b.y + 2, R, 0, Math.PI * 2);
      ctx.fill();
      const stripe = b.n >= 9;
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = stripe ? "#f7f5ef" : colorOf(b.n);
      ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
      if (stripe) {
        ctx.fillStyle = colorOf(b.n);
        ctx.fillRect(b.x - R, b.y - R * 0.55, R * 2, R * 1.1);
      }
      ctx.restore();
      if (b.n > 0) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(b.x, b.y, R * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.font = "bold 7px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(b.n), b.x, b.y + 0.5);
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(b.x - 3, b.y - 3.5, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawGuide = (angle: number, faint: boolean) => {
      const balls = ballsRef.current;
      const cue = balls[0];
      if (cue.in) return;
      const g = aimGuide(balls, angle);
      const a = faint ? 0.45 : 0.9;
      ctx.lineWidth = 1.6;
      // Caminho da branca até o contato
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(g.end.x, g.end.y);
      ctx.stroke();
      // Bola fantasma
      ctx.beginPath();
      ctx.arc(g.end.x, g.end.y, R, 0, Math.PI * 2);
      ctx.stroke();
      if (g.target && g.targetDir) {
        // Para onde a bola atingida vai (mais longa quanto mais de frente for a batida)
        const along = Math.max(0.25, Math.cos(angle) * g.targetDir.x + Math.sin(angle) * g.targetDir.y);
        ctx.strokeStyle = `rgba(255,214,90,${a})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(g.target.x, g.target.y);
        ctx.lineTo(g.target.x + g.targetDir.x * 150 * along, g.target.y + g.targetDir.y * 150 * along);
        ctx.stroke();
        if (g.cueDir) {
          // Desvio da branca depois da batida
          ctx.strokeStyle = `rgba(160,200,255,${a * 0.8})`;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(g.end.x, g.end.y);
          ctx.lineTo(g.end.x + g.cueDir.x * 60 * (1 - along + 0.2), g.end.y + g.cueDir.y * 60 * (1 - along + 0.2));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (g.cueDir) {
        // Tabela: mostra o rebote
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(g.end.x, g.end.y);
        ctx.lineTo(g.end.x + g.cueDir.x * 70, g.end.y + g.cueDir.y * 70);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Taco
      if (!faint) {
        const pull = 6 + powerRef.current * 40;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        ctx.strokeStyle = "#d8b07a";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cue.x - ux * (R + pull), cue.y - uy * (R + pull));
        ctx.lineTo(cue.x - ux * (R + pull + 200), cue.y - uy * (R + pull + 200));
        ctx.stroke();
        ctx.strokeStyle = "#f3efe6";
        ctx.beginPath();
        ctx.moveTo(cue.x - ux * (R + pull), cue.y - uy * (R + pull));
        ctx.lineTo(cue.x - ux * (R + pull + 8), cue.y - uy * (R + pull + 8));
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    };

    const draw = () => {
      ctx.fillStyle = "#4e2e19";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#7a4a2b";
      ctx.fillRect(5, 5, W - 10, H - 10);
      ctx.fillStyle = "#1c7a4b";
      ctx.fillRect(M, M, W - 2 * M, H - 2 * M);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(W * 0.25, M, 1, H - 2 * M);
      for (const [px, py] of POCKETS) {
        ctx.fillStyle = "#0a0a0a";
        ctx.beginPath();
        ctx.arc(px, py, POCKET - 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of ballsRef.current) if (!b.in) drawBall(b);
      const st = stateRef.current;
      if (!simRef.current && st.winner === null) {
        const mine = solo || st.turn === me;
        if (mine && dragRef.current !== "cue") drawGuide(aimRef.current, false);
        else if (!mine && oppAimRef.current !== null) drawGuide(oppAimRef.current, true);
        if (mine && st.inHand) {
          const cue = ballsRef.current[0];
          ctx.strokeStyle = "rgba(255,214,90,0.9)";
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(cue.x, cue.y, R + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      if (sim) {
        for (let i = 0; i < 6; i++) step(ballsRef.current, dt / 6, sim.log);
        finishIfStopped();
      }
      // Estado do adversário chegou e a animação local demorou demais: alinha.
      if (pendingRef.current && performance.now() - pendingRef.current.at > 2500) applyState(pendingRef.current.st);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, solo, me, publish, applyState]);

  const toTable = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const aimAt = (p: { x: number; y: number }) => {
    const cue = ballsRef.current[0];
    if (Math.hypot(p.x - cue.x, p.y - cue.y) < 2) return;
    aimRef.current = Math.atan2(p.y - cue.y, p.x - cue.x);
    sendAim(aimRef.current);
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canAct) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toTable(e);
    const cue = ballsRef.current[0];
    if (stateRef.current.inHand && Math.hypot(p.x - cue.x, p.y - cue.y) < R * 2.4) {
      dragRef.current = "cue";
      return;
    }
    dragRef.current = "aim";
    aimAt(p);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canAct) return;
    const p = toTable(e);
    if (dragRef.current === "cue") {
      if (canPlaceCue(ballsRef.current, p.x, p.y)) {
        ballsRef.current[0].x = p.x;
        ballsRef.current[0].y = p.y;
        stateRef.current.balls[0].x = p.x;
        stateRef.current.balls[0].y = p.y;
        const now = performance.now();
        if (net && now - lastSendRef.current > 90) {
          lastSendRef.current = now;
          net.send({ t: "place", x: p.x, y: p.y });
        }
      }
    } else if (dragRef.current === "aim" || e.pointerType === "mouse") {
      aimAt(p);
    }
  };
  const onUp = () => {
    if (dragRef.current === "cue") {
      const c = ballsRef.current[0];
      net?.send({ t: "place", x: c.x, y: c.y });
    }
    dragRef.current = null;
  };

  const restart = () => {
    const loser = ui.winner === null ? 0 : ((1 - ui.winner) as 0 | 1);
    const st = newGame(solo ? 0 : loser);
    applyState(st);
    net?.send({ t: "sync", st });
  };

  const left = (g: Group | null) => (g ? ui.balls.filter((b) => !b.in && groupOf(b.n) === g).map((b) => b.n) : []);
  const player = (i: 0 | 1) => {
    const g = ui.groups[i];
    const active = ui.winner === null && ui.turn === i && !solo;
    const rest = left(g);
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 ${active ? "bg-[var(--amber)]/20 ring-1 ring-[var(--amber)]" : "bg-white/5"} ${i === 1 ? "flex-row-reverse text-right" : ""}`}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {names[i]}
            {i === me && !solo ? " (você)" : ""}
          </div>
          <div className="text-[11px] text-[var(--muted)]">{g ? `${groupLabel(g)} · faltam ${rest.length}` : "mesa aberta"}</div>
        </div>
        <div className={`flex flex-wrap gap-0.5 ${i === 1 ? "mr-auto" : "ml-auto"}`}>
          {g &&
            rest.map((n) => (
              <span
                key={n}
                className="h-3 w-3 rounded-full border border-black/30"
                style={{ background: n >= 9 ? `linear-gradient(#f7f5ef 25%, ${colorOf(n)} 25% 75%, #f7f5ef 75%)` : colorOf(n) }}
              />
            ))}
          {g && rest.length === 0 && <span className="h-3 w-3 rounded-full bg-[#151515] ring-1 ring-white/40" title="Bola 8" />}
        </div>
      </div>
    );
  };

  const status = ui.winner !== null
    ? ""
    : ui.moving
      ? "…"
      : solo
        ? ui.inHand ? "Bola na mão: arraste a branca para onde quiser." : "Treino: mire e taque."
        : ui.turn === me
          ? ui.inHand ? "Sua vez, com bola na mão: arraste a branca e depois mire." : "Sua vez!"
          : `Vez de ${names[ui.turn]}…`;

  return (
    <div className="flex flex-col gap-2">
      {!solo && (
        <div className="flex gap-2">
          {player(0)}
          {player(1)}
        </div>
      )}
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`aspect-[640/340] w-full touch-none rounded-xl ${canAct ? "cursor-crosshair" : "cursor-default"}`}
          aria-label="Mesa de sinuca"
        />
        {ui.winner !== null && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-center text-white">
            <div className="px-4">
              <div className="font-pixel text-3xl">{solo ? "Fim de jogo 🎱" : ui.winner === me ? "Você venceu! 🏆" : `${names[ui.winner]} venceu`}</div>
              <div className="mt-1 text-sm text-white/80">{ui.msg}</div>
              <button type="button" onClick={restart} className="btn-primary mt-4 h-10 px-5">
                <RotateCcw size={16} /> Nova partida
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[180px] flex-1 items-center gap-2 text-xs text-[var(--muted)]">
          Força
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={power}
            onChange={(e) => {
              const v = Number(e.target.value);
              powerRef.current = v;
              setPower(v);
            }}
            className="flex-1 accent-[var(--amber)]"
            aria-label="Força da tacada"
          />
          <span className="w-9 tabular-nums text-white">{Math.round(power * 100)}%</span>
        </label>
        <button type="button" onClick={shoot} disabled={!canAct || (ui.turn !== me && !solo)} className="btn-primary h-10 px-5 text-sm">
          <Target size={16} /> Tacar
        </button>
      </div>
      <p className="min-h-5 text-sm text-white">{ui.msg && ui.winner === null ? <span className="text-[#ffcf8a]">{ui.msg} </span> : null}{status}</p>
      <p className="text-xs text-[var(--muted)]">
        Mova o mouse (ou arraste o dedo) para mirar · setas giram a mira com precisão · espaço ou “Tacar” para bater. Linha
        amarela: para onde a bola atingida vai.
      </p>
    </div>
  );
}
