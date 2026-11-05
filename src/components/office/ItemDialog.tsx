"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export interface Treat {
  emoji: string;
  label: string;
}

const MENUS: Record<"fridge" | "coffee" | "vending", { title: string; hint: string; items: Treat[] }> = {
  fridge: {
    title: "Geladeira",
    hint: "Pegue o que quiser — todo mundo vê o que você está segurando.",
    items: [
      { emoji: "🥤", label: "Refrigerante" },
      { emoji: "🧃", label: "Suco" },
      { emoji: "💧", label: "Água" },
      { emoji: "🧋", label: "Chá gelado" },
      { emoji: "🥛", label: "Leite" },
      { emoji: "🥪", label: "Sanduíche" },
      { emoji: "🍎", label: "Maçã" },
      { emoji: "🍰", label: "Bolo" },
      { emoji: "🍦", label: "Sorvete" },
      { emoji: "🧀", label: "Queijo" },
      { emoji: "🍉", label: "Melancia" },
      { emoji: "🍫", label: "Chocolate" },
    ],
  },
  coffee: {
    title: "Cafeteira",
    hint: "Escolha a bebida.",
    items: [
      { emoji: "☕", label: "Café" },
      { emoji: "🥛", label: "Café com leite" },
      { emoji: "🍵", label: "Chá" },
      { emoji: "🍫", label: "Chocolate quente" },
    ],
  },
  vending: {
    title: "Máquina de lanches",
    hint: "Escolha um lanche.",
    items: [
      { emoji: "🍫", label: "Chocolate" },
      { emoji: "🍪", label: "Biscoito" },
      { emoji: "🥨", label: "Pretzel" },
      { emoji: "🍿", label: "Pipoca" },
      { emoji: "🥤", label: "Refrigerante" },
      { emoji: "🍬", label: "Bala" },
    ],
  },
};

/** Geladeira aberta / cafeteira / máquina de lanches. */
export function ItemDialog({
  kind,
  onPick,
  onClose,
}: {
  kind: "fridge" | "coffee" | "vending";
  onPick: (t: Treat) => void;
  onClose: () => void;
}) {
  const menu = MENUS[kind];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fridge = kind === "fridge";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-label={menu.title}
        onClick={(e) => e.stopPropagation()}
        className={`panel-in w-full max-w-sm overflow-hidden rounded-2xl border-4 shadow-2xl ${fridge ? "border-[#c9cfd6] bg-[#eef3f7]" : "border-white/10 bg-[var(--panel)]"}`}
      >
        <header className={`flex items-center justify-between px-4 py-3 ${fridge ? "bg-[#dfe6ec]" : "border-b border-white/10"}`}>
          <div>
            <h2 className={`font-semibold ${fridge ? "text-[#1a2140]" : "text-white"}`}>{fridge ? "🧊 " : ""}{menu.title}</h2>
            <p className={`text-xs ${fridge ? "text-[#5b6478]" : "text-[var(--muted)]"}`}>{menu.hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`grid h-8 w-8 place-items-center rounded-lg ${fridge ? "text-[#5b6478] hover:bg-black/5" : "text-[var(--muted)] hover:bg-white/10"}`}
            aria-label={fridge ? "Fechar a geladeira" : "Fechar"}
          >
            <X size={18} />
          </button>
        </header>
        <div className={`grid grid-cols-4 gap-2 p-3 ${fridge ? "bg-[linear-gradient(#eef3f7_0_31%,#c9d3dc_31%_32%,#eef3f7_32%_64%,#c9d3dc_64%_65%,#eef3f7_65%)]" : ""}`}>
          {menu.items.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => onPick(t)}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] transition hover:scale-105 ${fridge ? "text-[#1a2140] hover:bg-white" : "text-white hover:bg-white/10"}`}
              aria-label={`Pegar ${t.label}`}
            >
              <span className="text-3xl leading-none">{t.emoji}</span>
              <span className="text-center leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
