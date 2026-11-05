"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAvatar } from "@/lib/avatar";
import { statusInfo } from "@/lib/status";
import type { GameBridge } from "@/lib/game/bridge";
import type { MusicEvent } from "@/lib/music";
import type { ChatMessage } from "@/lib/types";
import {
  ch,
  DIR_CODES,
  type ControlMsg,
  type KnockAnswerMsg,
  type KnockMsg,
  type MoveMsg,
  type PresenceData,
  type ReactionMsg,
  type RingMsg,
} from "./channels";

export type RealtimeState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "failed"
  | "unconfigured"
  | "duplicate"
  | "kicked"
  | "full";

export interface RosterEntry {
  id: string;
  connectionId: string;
  data: PresenceData;
}

export type ChatScope = "office" | "room" | "dm";

interface Options {
  officeId: string;
  myId: string;
  maxOnline: number;
  bridge: GameBridge;
  /** Estado de presença inicial/atual do jogador local. */
  initialPresence: PresenceData;
  onChat: (scope: ChatScope, msg: ChatMessage) => void;
  onControl: (msg: ControlMsg) => void;
  /** Alguém (outra pessoa) acabou de entrar no escritório. */
  onPeerJoin?: (id: string, name: string) => void;
  /** Caixa de som da sala atual mudou. */
  onMusic?: (e: MusicEvent) => void;
  /** Canal da sala conectado (eventos a partir daqui chegam em tempo real). */
  onRoomReady?: (roomId: string) => void;
  /** Reação (emoji) de alguém — inclusive a sua. */
  onReaction?: (fromId: string, msg: ReactionMsg) => void;
  /** Alguém está te chamando. */
  onRing?: (msg: RingMsg) => void;
  /** Alguém bateu na porta da sala em que você está. */
  onKnock?: (msg: KnockMsg) => void;
  /** Alguém de dentro respondeu a uma batida (fecha o pedido para todos). */
  onKnockResolved?: (fromId: string) => void;
  /** Resposta à sua batida. */
  onKnockAnswer?: (msg: KnockAnswerMsg) => void;
  /** Soco de brincadeira (de quem, em quem). */
  onPunch?: (fromId: string, toId: string) => void;
}

/** Emoji(s) antes do nome no mapa: status (se não for "disponível") e mão levantada. */
export function badgeOf(d: { status?: string; hand?: boolean; item?: string | null }): string {
  const st = d.status && d.status !== "disponivel" ? statusInfo(d.status).emoji : "";
  return `${d.hand ? "✋" : ""}${st}${d.item ?? ""}`;
}

const MOVE_INTERVAL_MS = 100; // no máximo 10 atualizações/s, e só quando há mudança
const PRESENCE_POS_DEBOUNCE_MS = 1200;

export function useOfficeRealtime(opts: Options) {
  const { officeId, myId, maxOnline, bridge } = opts;
  const [state, setState] = useState<RealtimeState>("connecting");
  const [roster, setRoster] = useState<RosterEntry[]>([]);

  const clientRef = useRef<Ably.Realtime | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const roomChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const presenceRef = useRef<PresenceData>(opts.initialPresence);
  const rosterRef = useRef(new Map<string, RosterEntry>());
  const latestMoveRef = useRef<MoveMsg | null>(null);
  const sentMoveRef = useRef<MoveMsg | null>(null);
  const finalStateRef = useRef<RealtimeState | null>(null);
  const cbRef = useRef(opts);

  useEffect(() => {
    cbRef.current = opts;
  });

  const publishRoster = useCallback(() => {
    setRoster(Array.from(rosterRef.current.values()));
  }, []);

  const applyMember = useCallback(
    (m: Ably.PresenceMessage, positionFromPresence: boolean) => {
      if (!m.clientId || m.clientId === myId) return;
      const data = m.data as PresenceData;
      if (!data || typeof data !== "object") return;
      rosterRef.current.set(m.clientId, { id: m.clientId, connectionId: m.connectionId ?? "", data });
      const existing = bridge.remotes.get(m.clientId);
      bridge.upsertRemote(m.clientId, {
        name: String(data.name ?? "Pessoa").slice(0, 32),
        avatar: parseAvatar(data.avatar),
        mic: Boolean(data.mic),
        inMeeting: Boolean(data.roomId),
        badge: badgeOf(data),
      });
      const stale = !existing || Date.now() - existing.updatedAt > 1500;
      if ((positionFromPresence || stale) && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        const r = bridge.remotes.get(m.clientId)!;
        r.tx = data.x;
        r.ty = data.y;
        r.dir = data.dir ?? r.dir;
        r.moving = false;
      }
    },
    [bridge, myId],
  );

  useEffect(() => {
    let disposed = false;
    finalStateRef.current = null;
    const tab = crypto.randomUUID();
    presenceRef.current = { ...presenceRef.current, tab };
    const rosterMap = rosterRef.current;

    const client = new Ably.Realtime({
      authCallback: async (_params, cb) => {
        try {
          const qs = new URLSearchParams({ officeId });
          if (roomIdRef.current) qs.set("roomId", roomIdRef.current);
          const res = await fetch(`/api/ably/token?${qs}`, { cache: "no-store" });
          if (res.status === 503) {
            finalStateRef.current = "unconfigured";
            setState("unconfigured");
            cb("Ably não configurado no servidor", null);
            setTimeout(() => client.close(), 0);
            return;
          }
          if (res.status === 401 || res.status === 403) {
            finalStateRef.current = "kicked";
            setState("kicked");
            cb("Acesso negado", null);
            setTimeout(() => client.close(), 0);
            return;
          }
          if (!res.ok) {
            cb(`Falha ao obter token (${res.status})`, null);
            return;
          }
          cb(null, (await res.json()) as Ably.TokenRequest);
        } catch (e) {
          cb(e instanceof Error ? e.message : String(e), null);
        }
      },
      echoMessages: false,
      closeOnUnload: true,
    });
    clientRef.current = client;

    let wasConnected = false;
    client.connection.on((change) => {
      if (disposed || finalStateRef.current) return;
      switch (change.current) {
        case "connected":
          setState("connected");
          if (wasConnected) void resync();
          wasConnected = true;
          break;
        case "connecting":
        case "disconnected":
          setState(wasConnected ? "reconnecting" : "connecting");
          break;
        case "suspended":
          setState("offline");
          break;
        case "failed":
          setState("failed");
          break;
      }
    });

    const channel = client.channels.get(ch.office(officeId));
    channelRef.current = channel;

    async function resync() {
      try {
        const members = await channel.presence.get();
        rosterMap.clear();
        const ids = new Set<string>();
        for (const m of members) {
          applyMember(m, false);
          if (m.clientId) ids.add(m.clientId);
        }
        for (const id of Array.from(bridge.remotes.keys())) if (!ids.has(id)) bridge.removeRemote(id);
        publishRoster();
      } catch {
        /* tentará de novo na próxima reconexão */
      }
    }

    void (async () => {
      try {
        await channel.subscribe("move", (msg) => {
          if (!msg.clientId || msg.clientId === myId) return;
          const m = msg.data as MoveMsg;
          if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
          bridge.moveRemote(msg.clientId, m.x, m.y, DIR_CODES[m.d] ?? "down", m.m === 1, msg.timestamp ?? Date.now());
        });
        await channel.subscribe("takeover", (msg) => {
          // Outra aba do MESMO usuário entrou: esta aba encerra.
          if (msg.clientId === myId && (msg.data as { tab?: string })?.tab !== tab) {
            finalStateRef.current = "duplicate";
            setState("duplicate");
            client.close();
          }
        });
        await channel.presence.subscribe((pm) => {
          if (pm.action === "leave" || pm.action === "absent") {
            const cur = pm.clientId ? rosterMap.get(pm.clientId) : undefined;
            if (pm.clientId && cur && cur.connectionId === pm.connectionId) {
              rosterMap.delete(pm.clientId);
              bridge.removeRemote(pm.clientId);
            }
          } else {
            const isNew = pm.action === "enter" && !!pm.clientId && pm.clientId !== myId && !rosterMap.has(pm.clientId);
            applyMember(pm, pm.action === "enter");
            if (isNew && pm.clientId) {
              const name = rosterMap.get(pm.clientId)?.data.name ?? "Alguém";
              cbRef.current.onPeerJoin?.(pm.clientId, name);
            }
          }
          publishRoster();
        });

        const before = await channel.presence.get();
        const others = new Set(before.filter((m) => m.clientId !== myId).map((m) => m.clientId));
        if (others.size >= maxOnline) {
          finalStateRef.current = "full";
          setState("full");
          client.close();
          return;
        }
        await channel.presence.enter(presenceRef.current);
        if (before.some((m) => m.clientId === myId && m.connectionId !== client.connection.id)) {
          await channel.publish("takeover", { tab });
        }
        await resync();

        const chat = client.channels.get(ch.chat(officeId));
        await chat.subscribe("message", (m) => cbRef.current.onChat("office", m.data as ChatMessage));
        const dm = client.channels.get(ch.dm(officeId, myId));
        await dm.subscribe("message", (m) => cbRef.current.onChat("dm", m.data as ChatMessage));
        await dm.subscribe("ring", (m) => cbRef.current.onRing?.(m.data as RingMsg));
        await dm.subscribe("knock-answer", (m) => cbRef.current.onKnockAnswer?.(m.data as KnockAnswerMsg));
        await channel.subscribe("punch", (m) => {
          const to = (m.data as { to?: unknown })?.to;
          if (m.clientId && m.clientId !== myId && typeof to === "string") cbRef.current.onPunch?.(m.clientId, to);
        });
        await channel.subscribe("react", (m) => {
          const d = m.data as ReactionMsg;
          if (m.clientId && m.clientId !== myId && d && typeof d.e === "string") cbRef.current.onReaction?.(m.clientId, d);
        });
        const control = client.channels.get(ch.control(officeId));
        await control.subscribe((m) => {
          const data = m.data as ControlMsg;
          if (data?.type === "kick" && data.userId === myId) {
            finalStateRef.current = "kicked";
            setState("kicked");
            client.close();
          }
          cbRef.current.onControl(data);
        });
      } catch (e) {
        if (!disposed && !finalStateRef.current) {
          console.warn("[realtime]", e);
        }
      }
    })();

    // Envio de movimento: no máximo 10/s e apenas quando algo mudou.
    const moveTimer = window.setInterval(() => {
      const latest = latestMoveRef.current;
      const sent = sentMoveRef.current;
      if (!latest || client.connection.state !== "connected") return;
      if (
        sent &&
        Math.abs(sent.x - latest.x) < 1 &&
        Math.abs(sent.y - latest.y) < 1 &&
        sent.d === latest.d &&
        sent.m === latest.m
      ) {
        return;
      }
      sentMoveRef.current = latest;
      channel.publish("move", latest).catch(() => {});
    }, MOVE_INTERVAL_MS);

    // Grava a posição na presença quando o jogador fica parado (para quem entrar depois).
    let lastPresencePos = { x: presenceRef.current.x, y: presenceRef.current.y };
    const presenceTimer = window.setInterval(() => {
      const latest = latestMoveRef.current;
      if (!latest || latest.m === 1 || client.connection.state !== "connected") return;
      if (Date.now() - latest.t < PRESENCE_POS_DEBOUNCE_MS) return;
      if (Math.abs(lastPresencePos.x - latest.x) < 2 && Math.abs(lastPresencePos.y - latest.y) < 2) return;
      lastPresencePos = { x: latest.x, y: latest.y };
      presenceRef.current = { ...presenceRef.current, x: Math.round(latest.x), y: Math.round(latest.y), dir: DIR_CODES[latest.d] };
      channel.presence.update(presenceRef.current).catch(() => {});
    }, 500);

    return () => {
      disposed = true;
      window.clearInterval(moveTimer);
      window.clearInterval(presenceTimer);
      try {
        channel.presence.leave().catch(() => {});
      } catch {
        /* conexão já encerrada */
      }
      client.close();
      clientRef.current = null;
      channelRef.current = null;
      roomChannelRef.current = null;
      rosterMap.clear();
      for (const id of Array.from(bridge.remotes.keys())) bridge.removeRemote(id);
    };
  }, [officeId, myId, maxOnline, bridge, applyMember, publishRoster]);

  /** Chamado pela cena a cada movimento local (o envio é limitado pelo timer). */
  const reportMove = useCallback(
    (x: number, y: number, dir: PresenceData["dir"], moving: boolean) => {
      latestMoveRef.current = {
        x: Math.round(x),
        y: Math.round(y),
        d: DIR_CODES.indexOf(dir) as MoveMsg["d"],
        m: moving ? 1 : 0,
        t: Date.now(),
      };
    },
    [],
  );

  /** Atualiza campos da presença (mic, câmera, sala, zona...). */
  const updatePresence = useCallback((patch: Partial<PresenceData>) => {
    presenceRef.current = { ...presenceRef.current, ...patch };
    const channel = channelRef.current;
    const client = clientRef.current;
    if (channel && client?.connection.state === "connected") {
      channel.presence.update(presenceRef.current).catch(() => {});
    }
  }, []);

  /** Entra/sai do canal de chat da sala (pede novo token com a permissão). */
  const setRoomChannel = useCallback(
    async (roomId: string | null) => {
      const client = clientRef.current;
      const prev = roomChannelRef.current;
      if (prev) {
        prev.unsubscribe();
        prev.detach().catch(() => {});
        roomChannelRef.current = null;
      }
      roomIdRef.current = roomId;
      if (!client || !roomId) return;
      try {
        await client.auth.authorize();
        const rc = client.channels.get(ch.room(officeId, roomId));
        roomChannelRef.current = rc;
        await rc.subscribe("message", (m) => cbRef.current.onChat("room", m.data as ChatMessage));
        await rc.subscribe("music", (m) => cbRef.current.onMusic?.(m.data as MusicEvent));
        await rc.subscribe("knock", (m) => cbRef.current.onKnock?.(m.data as KnockMsg));
        await rc.subscribe("knock-resolved", (m) =>
          cbRef.current.onKnockResolved?.((m.data as { fromId?: string })?.fromId ?? ""),
        );
        if (roomIdRef.current === roomId) cbRef.current.onRoomReady?.(roomId);
      } catch (e) {
        console.warn("[realtime] chat da sala indisponível", e);
      }
    },
    [officeId],
  );

  /** Envia uma reação (emoji) para quem está por perto / na mesma sala. */
  const sendReaction = useCallback(
    (e: string) => {
      const msg: ReactionMsg = { e, roomId: presenceRef.current.roomId ?? null };
      cbRef.current.onReaction?.(myId, msg);
      const channel = channelRef.current;
      if (channel && clientRef.current?.connection.state === "connected") channel.publish("react", msg).catch(() => {});
    },
    [myId],
  );

  /** Soco de brincadeira em alguém por perto. */
  const sendPunch = useCallback(
    (to: string) => {
      cbRef.current.onPunch?.(myId, to);
      const channel = channelRef.current;
      if (channel && clientRef.current?.connection.state === "connected") channel.publish("punch", { to }).catch(() => {});
    },
    [myId],
  );

  return { state, roster, reportMove, updatePresence, setRoomChannel, sendReaction, sendPunch };
}
