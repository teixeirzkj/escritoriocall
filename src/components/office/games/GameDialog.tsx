"use client";

import { Bot, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameMsg } from "@/lib/realtime/channels";
import type { RosterEntry } from "@/lib/realtime/useOfficeRealtime";
import { ArcadeGame } from "./ArcadeGame";
import { PaddleGame, type PaddleNet, type PaddleRole } from "./PaddleGame";
import { PoolGame } from "./PoolGame";

export interface GameTable {
  /** Identifica a mesa (ex.: "pingPong-12"). */
  key: string;
  type: "pingPong" | "foosball" | "poolTable" | "arcade";
  label: string;
}

export type GameBus = Set<(fromId: string, msg: GameMsg) => void>;

type Phase = "matching" | "waiting" | "playing";

/** Janela de jogo de uma mesa. Pingue-pongue e totó são para 2 pessoas (ou contra o computador). */
export function GameDialog({
  table,
  me,
  roster,
  bus,
  send,
  onClose,
}: {
  table: GameTable;
  me: { id: string; name: string };
  roster: RosterEntry[];
  bus: GameBus;
  send: (msg: GameMsg) => void;
  onClose: () => void;
}) {
  const twoPlayer = table.type === "pingPong" || table.type === "foosball";
  // Quem já está nesta mesa quando eu chego (vira meu adversário).
  const [host] = useState(() => (twoPlayer ? roster.find((r) => r.data.game === table.key) ?? null : null));
  const [phase, setPhase] = useState<Phase>(host ? "matching" : twoPlayer ? "waiting" : "playing");
  const [role, setRole] = useState<PaddleRole>("cpu");
  const [opponent, setOpponent] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const opponentRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);
  const roleRef = useRef(role);
  const listeners = useRef(new Set<{ onState?: (s: number[]) => void; onPaddle?: (y: number) => void }>());

  useEffect(() => {
    phaseRef.current = phase;
    roleRef.current = role;
  }, [phase, role]);

  const nameOf = useCallback((id: string) => roster.find((r) => r.id === id)?.data.name ?? "Adversário", [roster]);

  // Mensagens da mesa.
  useEffect(() => {
    const handler = (fromId: string, msg: GameMsg) => {
      if (msg.table !== table.key || msg.to !== me.id) return;
      if (msg.k === "join") {
        // Aceita adversário se estou esperando ou jogando contra o computador.
        if (opponentRef.current || phaseRef.current === "matching") return;
        opponentRef.current = fromId;
        setOpponent({ id: fromId, name: nameOf(fromId) });
        setRole("host");
        setPhase("playing");
        setNotice(null);
        send({ k: "start", table: table.key, to: fromId });
      } else if (msg.k === "start") {
        if (phaseRef.current !== "matching") return;
        opponentRef.current = fromId;
        setOpponent({ id: fromId, name: nameOf(fromId) });
        setRole("guest");
        setPhase("playing");
      } else if (msg.k === "state") {
        if (fromId === opponentRef.current) for (const l of listeners.current) l.onState?.(msg.s);
      } else if (msg.k === "paddle") {
        if (fromId === opponentRef.current) for (const l of listeners.current) l.onPaddle?.(msg.y);
      } else if (msg.k === "leave") {
        if (fromId !== opponentRef.current) return;
        opponentRef.current = null;
        setOpponent(null);
        setRole("cpu");
        setPhase("waiting");
        setNotice(`${nameOf(fromId)} saiu da mesa.`);
      }
    };
    bus.add(handler);
    return () => {
      bus.delete(handler);
    };
  }, [bus, me.id, table.key, send, nameOf]);

  // Chegando numa mesa com alguém: pede para jogar. Sem resposta em 4s, a mesa está ocupada.
  useEffect(() => {
    if (!host) return;
    send({ k: "join", table: table.key, to: host.id });
    const t = window.setTimeout(() => {
      if (phaseRef.current === "matching") {
        setPhase("waiting");
        setNotice(`${host.data.name} já está jogando com outra pessoa.`);
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [host, send, table.key]);

  // Ao fechar, avisa o adversário.
  useEffect(() => {
    return () => {
      if (opponentRef.current) send({ k: "leave", table: table.key, to: opponentRef.current });
    };
  }, [send, table.key]);

  const net = useMemo<PaddleNet>(
    () => ({
      sendState: (s) => opponentRef.current && send({ k: "state", table: table.key, to: opponentRef.current, s }),
      sendPaddle: (y) => opponentRef.current && send({ k: "paddle", table: table.key, to: opponentRef.current, y }),
      listen: (h) => {
        listeners.current.add(h);
        return () => {
          listeners.current.delete(h);
        };
      },
    }),
    [send, table.key],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3">
      <div role="dialog" aria-label={table.label} className="panel-in w-full max-w-2xl rounded-2xl border border-white/10 bg-[var(--panel)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-semibold text-white">{table.label}</h2>
            <p className="text-xs text-[var(--muted)]">
              {twoPlayer
                ? opponent
                  ? `Partida contra ${opponent.name}`
                  : phase === "playing"
                    ? "Contra o computador — se alguém sentar na mesa, vira partida de verdade"
                    : "Mesa para 2 pessoas"
                : "Jogo individual com recorde"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white"
            aria-label="Sair do jogo"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-4">
          {phase === "matching" && (
            <div className="grid h-56 place-items-center text-center text-sm text-[var(--muted)]">
              <div>
                <span className="loader-pixel mx-auto mb-4" aria-hidden />
                Chamando {host?.data.name} para jogar…
              </div>
            </div>
          )}
          {phase === "waiting" && (
            <div className="grid h-56 place-items-center text-center">
              <div className="space-y-3">
                {notice && <p className="text-sm text-[#ffcf8a]">{notice}</p>}
                <p className="flex items-center justify-center gap-2 text-sm text-white">
                  <Users size={16} /> Aguardando alguém chegar na mesa para jogar com você…
                </p>
                <p className="text-xs text-[var(--muted)]">Quem clicar nesta mesa entra direto na sua partida.</p>
                <button
                  type="button"
                  onClick={() => {
                    setRole("cpu");
                    setPhase("playing");
                  }}
                  className="btn-primary h-10 px-4 text-sm"
                >
                  <Bot size={16} /> Jogar contra o computador
                </button>
              </div>
            </div>
          )}
          {phase === "playing" && (table.type === "pingPong" || table.type === "foosball") && (
            <PaddleGame
              key={`${role}-${opponent?.id ?? "cpu"}`}
              theme={table.type === "pingPong" ? "pingpong" : "foosball"}
              role={role}
              myName={me.name}
              opponentName={opponent?.name ?? "Computador"}
              net={role === "cpu" ? null : net}
            />
          )}
          {phase === "playing" && table.type === "poolTable" && <PoolGame />}
          {phase === "playing" && table.type === "arcade" && <ArcadeGame />}
        </div>
      </div>
    </div>
  );
}
