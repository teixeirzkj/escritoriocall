"use client";

import { useEffect, useRef } from "react";
import { avatarKey, type AvatarConfig } from "@/lib/avatar";
import { CHAR_H, CHAR_W, drawCharacterSheet, frameRect, type Dir } from "@/lib/game/art/characters";

const cache = new Map<string, HTMLCanvasElement>();

function sheetFor(a: AvatarConfig) {
  const k = avatarKey(a);
  let s = cache.get(k);
  if (!s) {
    s = drawCharacterSheet(a);
    cache.set(k, s);
  }
  return s;
}

interface Props {
  avatar: AvatarConfig;
  /** Escala em pixels por pixel do sprite (32×46 base). */
  scale?: number;
  dir?: Dir;
  /** Anima caminhada. */
  walking?: boolean;
  /** Mostra apenas a parte superior (rosto). */
  bust?: boolean;
  className?: string;
  title?: string;
}

/** Desenha o personagem (mesmo gerador usado no jogo) em um <canvas>. */
export function AvatarThumb({ avatar, scale = 1, dir = "down", walking = false, bust = false, className, title }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h = bust ? Math.round(CHAR_H * 0.6) : CHAR_H;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const sheet = sheetFor(avatar);
    let frame = 0;
    let raf = 0;
    let last = 0;
    const order = [1, 0, 2, 0];
    const draw = (f: number) => {
      const r = frameRect(dir, f);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(sheet, r.x, r.y + (bust ? 2 : 0), r.w, h, 0, 0, c.width, c.height);
    };
    if (!walking) {
      draw(0);
      return;
    }
    const tick = (t: number) => {
      if (t - last > 120) {
        last = t;
        frame = (frame + 1) % 4;
        draw(order[frame]);
      }
      raf = requestAnimationFrame(tick);
    };
    draw(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [avatar, dir, walking, bust, h]);

  return (
    <canvas
      ref={ref}
      width={CHAR_W * scale}
      height={h * scale}
      className={className}
      style={{ imageRendering: "pixelated", width: CHAR_W * scale, height: h * scale }}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
