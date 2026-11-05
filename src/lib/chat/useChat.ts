"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatScope } from "@/lib/realtime/useOfficeRealtime";
import type { ChatMessage } from "@/lib/types";

/** Chave de conversa: "office", "room:<id>" ou "dm:<peerId>". */
export type ThreadKey = string;

export function threadKeyFor(scope: ChatScope, msg: ChatMessage, myId: string): ThreadKey {
  if (scope === "room" && msg.room_id) return `room:${msg.room_id}`;
  if (scope === "dm") return `dm:${msg.sender_id === myId ? msg.recipient_id : msg.sender_id}`;
  return "office";
}

export function useChat(officeId: string, myId: string) {
  const [threads, setThreads] = useState<Record<ThreadKey, ChatMessage[]>>({});
  const [unread, setUnread] = useState<Record<ThreadKey, number>>({});
  const [loading, setLoading] = useState<Record<ThreadKey, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(new Set<ThreadKey>());
  const activeRef = useRef<ThreadKey | null>(null);

  const append = useCallback((key: ThreadKey, msgs: ChatMessage[], countUnread: boolean) => {
    setThreads((prev) => {
      const cur = prev[key] ?? [];
      const ids = new Set(cur.map((m) => m.id));
      const fresh = msgs.filter((m) => !ids.has(m.id));
      if (!fresh.length) return prev;
      const merged = [...cur, ...fresh].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { ...prev, [key]: merged.slice(-200) };
    });
    if (countUnread && activeRef.current !== key) {
      const others = msgs.filter((m) => m.sender_id !== myId).length;
      if (others) setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + others }));
    }
  }, [myId]);

  const receive = useCallback(
    (scope: ChatScope, msg: ChatMessage) => {
      if (!msg?.id) return;
      append(threadKeyFor(scope, msg, myId), [msg], true);
    },
    [append, myId],
  );

  const load = useCallback(
    async (key: ThreadKey) => {
      if (loaded.current.has(key)) return;
      loaded.current.add(key);
      const qs = new URLSearchParams({ officeId });
      if (key === "office") qs.set("scope", "office");
      else if (key.startsWith("room:")) {
        qs.set("scope", "room");
        qs.set("roomId", key.slice(5));
      } else {
        qs.set("scope", "dm");
        qs.set("peerId", key.slice(3));
      }
      setLoading((l) => ({ ...l, [key]: true }));
      try {
        const res = await fetch(`/api/messages?${qs}`, { cache: "no-store" });
        if (!res.ok) {
          loaded.current.delete(key);
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Não foi possível carregar o histórico");
          return;
        }
        const { messages } = (await res.json()) as { messages: ChatMessage[] };
        append(key, messages, false);
      } catch {
        loaded.current.delete(key);
        setError("Sem conexão para carregar o histórico");
      } finally {
        setLoading((l) => ({ ...l, [key]: false }));
      }
    },
    [officeId, append],
  );

  const send = useCallback(
    async (key: ThreadKey, body: string): Promise<boolean> => {
      const payload: Record<string, string> = { officeId, body };
      if (key === "office") payload.scope = "office";
      else if (key.startsWith("room:")) {
        payload.scope = "room";
        payload.roomId = key.slice(5);
      } else {
        payload.scope = "dm";
        payload.peerId = key.slice(3);
      }
      setError(null);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: ChatMessage; error?: string };
        if (!res.ok || !data.message) {
          setError(data.error ?? "Mensagem não enviada");
          return false;
        }
        append(key, [data.message], false);
        return true;
      } catch {
        setError("Sem conexão: mensagem não enviada");
        return false;
      }
    },
    [officeId, append],
  );

  const setActive = useCallback((key: ThreadKey | null) => {
    activeRef.current = key;
    if (key) setUnread((u) => (u[key] ? { ...u, [key]: 0 } : u));
  }, []);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return { threads, unread, totalUnread, loading, error, setError, receive, load, send, setActive };
}
