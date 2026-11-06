"use client";

import { Download, Eraser, Pencil, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_H, BOARD_W, MAX_POINTS, type Stroke } from "@/lib/board";

const COLORS = [
  { c: "#16224f", label: "Azul-marinho" },
  { c: "#2b6af3", label: "Azul" },
  { c: "#e5484d", label: "Vermelho" },
  { c: "#18a058", label: "Verde" },
  { c: "#f5a524", label: "Amarelo" },
];
const SIZES = [
  { w: 4, label: "Fino" },
  { w: 10, label: "Grosso" },
];
const ERASER_W = 36;

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.p;
  if (p.length < 2) return;
  ctx.strokeStyle = s.c === "eraser" ? "#ffffff" : s.c;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = s.w;
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  // Curvas pelos pontos médios: traço suave mesmo com poucos pontos.
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  ctx.stroke();
}

interface Props {
  strokes: Stroke[];
  meId: string;
  /** Só visualização (janela minimizada). */
  readOnly?: boolean;
  /** Traço sendo desenhado (`final` no fim) — o pai envia para a sala. */
  onStroke?: (s: Stroke, final: boolean) => void;
  onUndo?: () => void;
  onClear?: () => void;
  onClose?: () => void;
}

/** Quadro branco compartilhado: todos da sala desenham juntos. */
export function Whiteboard({ strokes, meId, readOnly, onStroke, onUndo, onClear, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0].c);
  const [size, setSize] = useState(SIZES[0].w);
  const [eraser, setEraser] = useState(false);
  const current = useRef<Stroke | null>(null);
  const lastSent = useRef(0);
  const strokesRef = useRef(strokes);
  const frame = useRef(0);

  const redraw = useCallback(() => {
    frame.current = 0;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const cur = current.current;
    for (const s of strokesRef.current) if (!cur || s.id !== cur.id) drawStroke(ctx, s);
    if (cur) drawStroke(ctx, cur);
  }, []);
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(redraw);
  }, [redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    schedule();
  }, [strokes, schedule]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  const toBoard = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * BOARD_W),
      Math.round(((e.clientY - r.top) / r.height) * BOARD_H),
    ] as const;
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toBoard(e);
    current.current = {
      id: `${meId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      by: meId,
      c: eraser ? "eraser" : color,
      w: eraser ? ERASER_W : size,
      p: [x, y],
    };
    lastSent.current = performance.now();
    schedule();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = current.current;
    if (!s) return;
    const [x, y] = toBoard(e);
    const lx = s.p[s.p.length - 2];
    const ly = s.p[s.p.length - 1];
    if (Math.hypot(x - lx, y - ly) < 3) return;
    if (s.p.length >= MAX_POINTS * 2) {
      // Traço muito longo: fecha este e começa outro na sequência.
      onStroke?.({ ...s, p: s.p.slice() }, true);
      current.current = { ...s, id: `${s.id}+`, p: [lx, ly, x, y] };
    } else {
      s.p.push(x, y);
    }
    const now = performance.now();
    if (now - lastSent.current > 120) {
      lastSent.current = now;
      const c = current.current!;
      onStroke?.({ ...c, p: c.p.slice() }, false);
    }
    schedule();
  };
  const onUp = () => {
    const s = current.current;
    if (!s) return;
    current.current = null;
    onStroke?.({ ...s, p: s.p.slice() }, true);
    schedule();
  };

  const download = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `quadro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
    a.click();
  };

  const hasMine = strokes.some((s) => s.by === meId);
  const tool = "grid h-9 w-9 shrink-0 place-items-center rounded-lg transition";

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {!readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl bg-[#0e1533] p-1.5 sm:gap-1.5" role="toolbar" aria-label="Ferramentas do quadro">
          {COLORS.map((c) => (
            <button
              key={c.c}
              type="button"
              onClick={() => {
                setColor(c.c);
                setEraser(false);
              }}
              aria-pressed={!eraser && color === c.c}
              aria-label={`Caneta ${c.label}`}
              title={c.label}
              className={`${tool} ${!eraser && color === c.c ? "bg-white/15 ring-2 ring-[var(--amber)]" : "hover:bg-white/10"}`}
            >
              <span className="h-5 w-5 rounded-full border border-white/30" style={{ background: c.c }} />
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" aria-hidden />
          {SIZES.map((s) => (
            <button
              key={s.w}
              type="button"
              onClick={() => {
                setSize(s.w);
                setEraser(false);
              }}
              aria-pressed={!eraser && size === s.w}
              aria-label={`Traço ${s.label.toLowerCase()}`}
              title={s.label}
              className={`${tool} text-white ${!eraser && size === s.w ? "bg-white/15" : "hover:bg-white/10"}`}
            >
              <Pencil size={s.w > 5 ? 18 : 13} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEraser((v) => !v)}
            aria-pressed={eraser}
            aria-label="Borracha"
            title="Borracha"
            className={`${tool} text-white ${eraser ? "bg-[var(--amber)]" : "hover:bg-white/10"}`}
          >
            <Eraser size={17} />
          </button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" aria-hidden />
          <button type="button" onClick={onUndo} disabled={!hasMine} aria-label="Desfazer meu último traço" title="Desfazer" className={`${tool} text-white hover:bg-white/10 disabled:opacity-35`}>
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (strokes.length && window.confirm("Limpar o quadro para todo mundo?")) onClear?.();
            }}
            disabled={!strokes.length}
            aria-label="Limpar o quadro"
            title="Limpar para todos"
            className={`${tool} text-white hover:bg-white/10 disabled:opacity-35`}
          >
            <Trash2 size={17} />
          </button>
          <button type="button" onClick={download} aria-label="Baixar o quadro como imagem" title="Baixar imagem" className={`${tool} text-white hover:bg-white/10`}>
            <Download size={17} />
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="btn-ghost h-9 shrink-0 px-3 text-sm" aria-label="Fechar o quadro para todos">
            <X size={15} /> <span className="hidden sm:inline">Fechar quadro</span>
          </button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 place-items-center" style={{ containerType: "size" }}>
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Quadro branco"
          className={`touch-none rounded-xl bg-white shadow-lg ${readOnly ? "" : eraser ? "cursor-cell" : "cursor-crosshair"}`}
          style={{ width: "min(100cqw, calc(100cqh * 16 / 9))", aspectRatio: "16 / 9" }}
        />
      </div>
    </div>
  );
}
