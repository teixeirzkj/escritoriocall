"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge } from "@/lib/game/bridge";

const RADIUS = 48;

/** Joystick virtual para telas de toque (só aparece em ponteiro "grosso"). */
export function TouchJoystick({ bridge }: { bridge: GameBridge }) {
  const [enabled, setEnabled] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!enabled) return null;

  const move = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    if (Math.hypot(nx, ny) < 0.2) bridge.setTouch(0, 0);
    else bridge.setTouch(nx, ny);
  };

  const end = () => {
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    bridge.setTouch(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="absolute bottom-24 left-5 z-30 h-32 w-32 touch-none select-none rounded-full border border-white/15 bg-black/25 backdrop-blur-sm"
      onPointerDown={(e) => {
        pointerRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => pointerRef.current === e.pointerId && move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Controle de movimento"
      role="application"
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/80 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
