"use client";

import { ArrowLeft, Lock, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { useChat } from "@/lib/chat/useChat";
import type { RoomInfo } from "@/lib/types";
import type { ParticipantRow } from "./ParticipantsPanel";

type Chat = ReturnType<typeof useChat>;

interface Props {
  myId: string;
  chat: Chat;
  thread: string;
  onThread: (t: string) => void;
  meetingRoom: RoomInfo | null;
  people: ParticipantRow[];
  onClose: () => void;
  onFocusChange: (focused: boolean) => void;
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function ChatPanel({ myId, chat, thread, onThread, meetingRoom, people, onClose, onFocusChange }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [dmPicker, setDmPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { load, setActive } = chat;

  const tab: "office" | "room" | "dm" = thread === "office" ? "office" : thread.startsWith("room:") ? "room" : "dm";
  const peerId = tab === "dm" ? thread.slice(3) : null;
  const peer = people.find((p) => p.id === peerId);
  const messages = useMemo(() => chat.threads[thread] ?? [], [chat.threads, thread]);

  // Conversas privadas conhecidas (com histórico ou pessoas online).
  const dmThreads = useMemo(() => {
    const keys = new Set(Object.keys(chat.threads).filter((k) => k.startsWith("dm:")));
    return Array.from(keys).map((k) => {
      const id = k.slice(3);
      const last = chat.threads[k]?.at(-1);
      const name = people.find((p) => p.id === id)?.name ?? last?.sender?.display_name ?? "Pessoa";
      return { key: k, id, name, last };
    });
  }, [chat.threads, people]);

  useEffect(() => {
    void load(thread);
    setActive(thread);
    return () => setActive(null);
  }, [thread, load, setActive]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thread]);

  useEffect(() => () => onFocusChange(false), [onFocusChange]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await chat.send(thread, body);
    setSending(false);
    if (ok) setText("");
  };

  const dmUnread = dmThreads.reduce((a, t) => a + (chat.unread[t.key] ?? 0), 0);

  return (
    <aside
      className="panel-in absolute bottom-24 right-3 top-20 z-40 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#131c42]/95 shadow-2xl backdrop-blur sm:right-4"
      aria-label="Chat"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Chat</h2>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white" aria-label="Fechar chat">
          <X size={16} />
        </button>
      </header>

      <nav className="flex gap-1 border-b border-white/10 p-2 text-xs" role="tablist">
        <TabBtn active={tab === "office"} onClick={() => { setDmPicker(false); onThread("office"); }} badge={chat.unread.office}>
          Escritório
        </TabBtn>
        <TabBtn
          active={tab === "room"}
          disabled={!meetingRoom}
          onClick={() => { setDmPicker(false); if (meetingRoom) onThread(`room:${meetingRoom.id}`); }}
          badge={meetingRoom ? chat.unread[`room:${meetingRoom.id}`] : undefined}
          title={meetingRoom ? undefined : "Entre em uma sala para usar o chat da sala"}
        >
          {meetingRoom ? meetingRoom.name : "Sala"}
        </TabBtn>
        <TabBtn active={tab === "dm"} onClick={() => setDmPicker(true)} badge={dmUnread}>
          Privadas
        </TabBtn>
      </nav>

      {dmPicker ? (
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-2 pt-1 text-xs text-[var(--muted)]">Escolha alguém para conversar em particular.</p>
          {dmThreads.length > 0 && (
            <ul className="mb-2 space-y-1">
              {dmThreads.map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={() => { setDmPicker(false); onThread(t.key); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{t.name}</span>
                      {t.last && <span className="block truncate text-xs text-[var(--muted)]">{t.last.body}</span>}
                    </span>
                    {chat.unread[t.key] ? <span className="rounded-full bg-[var(--coral)] px-1.5 text-[10px] font-bold text-white">{chat.unread[t.key]}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">Online</div>
          <ul className="space-y-1">
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setDmPicker(false); onThread(`dm:${p.id}`); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/5">
                  {p.name} <span className="text-xs text-[var(--muted)]">· {p.label}</span>
                </button>
              </li>
            ))}
            {people.length === 0 && <li className="px-3 py-2 text-sm text-[var(--muted)]">Ninguém mais online agora.</li>}
          </ul>
        </div>
      ) : (
        <>
          {tab === "dm" && (
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-[var(--muted)]">
              <button type="button" onClick={() => setDmPicker(true)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10" aria-label="Voltar às conversas">
                <ArrowLeft size={14} />
              </button>
              <Lock size={12} /> Conversa privada com <span className="text-white">{peer?.name ?? "pessoa offline"}</span>
            </div>
          )}
          {tab === "room" && (
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-[var(--muted)]">
              <Lock size={12} /> Visível só para quem tem acesso à sala
            </div>
          )}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
            {chat.loading[thread] && <p className="text-center text-xs text-[var(--muted)]">Carregando histórico…</p>}
            {!chat.loading[thread] && messages.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Nenhuma mensagem ainda. Diga oi! 👋</p>
            )}
            {messages.map((m, i) => {
              const mine = m.sender_id === myId;
              const prev = messages[i - 1];
              const grouped = prev && prev.sender_id === m.sender_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 120_000;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${grouped ? "-mt-2" : ""}`}>
                  {!grouped && (
                    <div className="mb-0.5 flex items-baseline gap-2 text-[11px] text-[var(--muted)]">
                      <span className="font-medium text-[#c9cbe0]">{mine ? "Você" : m.sender?.display_name ?? "Pessoa"}</span>
                      <time dateTime={m.created_at}>{timeFmt.format(new Date(m.created_at))}</time>
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-md bg-[var(--amber)] text-white" : "rounded-bl-md bg-white/[0.07] text-white"}`}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>
          {chat.error && (
            <div className="mx-3 mb-2 flex items-center justify-between rounded-lg bg-[var(--coral)]/15 px-3 py-2 text-xs text-[#ffb4ad]">
              {chat.error}
              <button type="button" onClick={() => chat.setError(null)} aria-label="Fechar aviso"><X size={12} /></button>
            </div>
          )}
          <form
            className="flex items-end gap-2 border-t border-white/10 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => onFocusChange(true)}
              onBlur={() => onFocusChange(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
              }}
              rows={1}
              maxLength={2000}
              placeholder={tab === "dm" ? `Mensagem para ${peer?.name ?? "pessoa"}` : "Escreva uma mensagem…"}
              className="input max-h-32 min-h-10 flex-1 resize-none py-2 text-sm"
              aria-label="Mensagem"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--amber)] text-white transition hover:brightness-105 disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </aside>
  );
}

function TabBtn({
  active,
  disabled,
  onClick,
  children,
  badge,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`relative flex-1 truncate rounded-lg px-2 py-1.5 font-medium transition disabled:opacity-40 ${active ? "bg-white/10 text-white" : "text-[var(--muted)] hover:bg-white/5"}`}
    >
      {children}
      {badge ? <span className="ml-1 rounded-full bg-[var(--coral)] px-1.5 text-[10px] font-bold text-white">{badge}</span> : null}
    </button>
  );
}
