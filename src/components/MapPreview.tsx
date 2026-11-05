"use client";

import { useEffect, useRef, useState } from "react";
import { drawFullScene } from "@/lib/game/art/environment";
import { WORLD_H, WORLD_W } from "@/lib/game/map";

/**
 * Prévia real do mapa do escritório (o mesmo usado no jogo), renderizada no
 * navegador e percorrida lentamente pela câmera. Sem personagens simulados.
 */
export function MapPreview({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scene = drawFullScene();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Roteiro da câmera: pontos de interesse (px no mundo).
    const stops = [
      { x: 860, y: 1080 },
      { x: 620, y: 620 },
      { x: 280, y: 180 },
      { x: 1120, y: 200 },
      { x: 1640, y: 620 },
      { x: 220, y: 900 },
    ];
    let raf = 0;
    const start = performance.now();
    const seg = 7000;
    const render = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const zoom = Math.max(1, Math.round((h * dpr) / 520));
      const viewW = canvas.width / zoom;
      const viewH = canvas.height / zoom;
      // O timestamp do rAF pode ser anterior a "start" no primeiro quadro.
      const elapsed = reduce ? 0 : Math.max(0, t - start);
      const i = Math.floor(elapsed / seg) % stops.length;
      const a = stops[i];
      const b = stops[(i + 1) % stops.length];
      const k = (elapsed % seg) / seg;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      let cx = a.x + (b.x - a.x) * e - viewW / 2;
      let cy = a.y + (b.y - a.y) * e - viewH / 2;
      cx = Math.max(0, Math.min(WORLD_W - viewW, cx));
      cy = Math.max(0, Math.min(WORLD_H - viewH, cy));
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#0e1533";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(scene, Math.round(cx), Math.round(cy), viewW, viewH, 0, 0, canvas.width, canvas.height);
      if (!reduce) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    setReady(true);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className={`h-full w-full transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"} ${className}`}
      style={{ imageRendering: "pixelated" }}
      role="img"
      aria-label="Prévia do mapa do escritório virtual em pixel art"
    />
  );
}
