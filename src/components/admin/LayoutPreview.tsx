"use client";

import { useEffect, useRef } from "react";
import { drawFullScene } from "@/lib/game/art/environment";
import { applyOfficeMap, type LayoutSpec } from "@/lib/game/map";

/** Miniatura do mapa da sede (o mesmo desenho do jogo). */
export function LayoutPreview({ spec }: { spec: LayoutSpec | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    applyOfficeMap(JSON.parse(key) as LayoutSpec | null);
    const scene = drawFullScene();
    canvas.width = scene.width / 2;
    canvas.height = scene.height / 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(scene, 0, 0, canvas.width, canvas.height);
  }, [key]);
  return <canvas ref={ref} className="h-auto w-full rounded-xl border border-white/10 bg-[#1b2030]" aria-label="Prévia do mapa da sede" />;
}
