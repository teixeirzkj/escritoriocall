"use client";

import { CalendarDays, CalendarPlus, Check, Clock, DoorOpen, Plus, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { type Booking, fmtDay, fmtTime, googleCalendarUrl, overlaps, sameDay } from "@/lib/bookings";
import type { RoomInfo } from "@/lib/types";

export interface NewBooking {
  roomId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  attendees: string[];
}

interface Props {
  rooms: RoomInfo[];
  bookings: Booking[];
  members: { id: string; name: string }[];
  meId: string;
  isManager: boolean;
  officeUrl: string;
  /** Sala atual (já vem escolhida no formulário). */
  defaultRoomId: string | null;
  now: number;
  onCreate: (b: NewBooking) => Promise<string | null>;
  onCancel: (id: string) => Promise<void>;
  onJoin: (room: RoomInfo) => void;
  onClose: () => void;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Próximo horário "redondo" (de 15 em 15 minutos). */
function nextSlot(now: number) {
  const d = new Date(now + 5 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

/** Agenda das salas: o que está reservado em cada dia e formulário de nova reserva. */
export function AgendaDialog({
  rooms,
  bookings,
  members,
  meId,
  isManager,
  officeUrl,
  defaultRoomId,
  now,
  onCreate,
  onCancel,
  onJoin,
  onClose,
}: Props) {
  const days = useMemo(() => {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
  }, [now]);
  const [dayIdx, setDayIdx] = useState(0);
  const day = days[dayIdx];
  const [creating, setCreating] = useState(false);

  // Formulário
  const slot = nextSlot(now);
  const [roomId, setRoomId] = useState(defaultRoomId ?? rooms.find((r) => r.canAccess)?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(dateValue(slot));
  const [time, setTime] = useState(`${pad(slot.getHours())}:${pad(slot.getMinutes())}`);
  const [duration, setDuration] = useState(30);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const start = new Date(`${date}T${time}:00`).getTime();
  const end = start + duration * 60_000;
  const clash = roomId && Number.isFinite(start) ? overlaps(bookings, roomId, start, end) : null;
  const people = members.filter((m) => m.id !== meId && m.name.toLowerCase().includes(search.trim().toLowerCase()));
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const openForm = (presetDay?: Date) => {
    if (presetDay && dayIdx > 0) {
      setDate(dateValue(presetDay));
      setTime("09:00");
    }
    setError(null);
    setCreating(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(start)) return setError("Escolha a data e o horário.");
    if (end < now) return setError("Esse horário já passou.");
    setBusy(true);
    setError(null);
    const err = await onCreate({
      roomId,
      title: title.trim() || "Reunião",
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      attendees: Array.from(invited),
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setCreating(false);
    setTitle("");
    setInvited(new Set());
    const d = new Date(start);
    const idx = days.findIndex((x) => sameDay(d.toISOString(), x));
    if (idx >= 0) setDayIdx(idx);
  };

  const dayBookings = bookings
    .filter((b) => sameDay(b.startsAt, day))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agenda das salas"
        className="panel-in flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border-white/10 bg-[#131c42] shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <CalendarDays size={18} className="text-[var(--amber)]" /> Agenda das salas
          </h2>
          <div className="flex items-center gap-2">
            {!creating && (
              <button type="button" onClick={() => openForm(day)} className="btn-primary h-9 px-3 text-sm">
                <Plus size={15} /> Reservar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/10 hover:text-white"
              aria-label="Fechar a agenda"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {creating ? (
            <form onSubmit={submit} className="space-y-4 px-4 py-4 sm:px-5" aria-label="Nova reserva">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Nome da reunião</span>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Ex.: Alinhamento semanal"
                  aria-label="Nome da reunião"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Sala</span>
                <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Sala">
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.canAccess}>
                      {r.name} · até {r.capacity} pessoas{r.canAccess ? "" : " (restrita)"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Dia</span>
                  <input type="date" className="input" value={date} min={dateValue(new Date(now))} onChange={(e) => setDate(e.target.value)} aria-label="Dia" required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Início</span>
                  <input type="time" step={300} className="input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Horário de início" required />
                </label>
                <label className="col-span-2 block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Duração</span>
                  <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duração">
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d < 60 ? `${d} min` : `${Math.floor(d / 60)}h${d % 60 ? d % 60 : ""}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {clash && (
                <p className="rounded-lg bg-[#3a2228] px-3 py-2 text-xs text-[#ff9b92]">
                  Já existe “{clash.title}” nessa sala das {fmtTime(clash.startsAt)} às {fmtTime(clash.endsAt)}.
                </p>
              )}
              <fieldset>
                <legend className="mb-1 flex w-full items-center justify-between text-xs font-medium text-[var(--muted)]">
                  <span>Convidados (recebem um aviso 5 min antes)</span>
                  <span>{invited.size} escolhido(s)</span>
                </legend>
                <input
                  className="input mb-2"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar pessoa…"
                  aria-label="Buscar pessoa para convidar"
                />
                <div className="scroll-thin grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                  {people.map((m) => {
                    const on = invited.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setInvited((s) => {
                            const n = new Set(s);
                            if (on) n.delete(m.id);
                            else n.add(m.id);
                            return n;
                          })
                        }
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${on ? "bg-[var(--amber)]/20 text-white" : "bg-white/5 text-[var(--text)] hover:bg-white/10"}`}
                      >
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-[var(--amber)] bg-[var(--amber)]" : "border-white/30"}`}>
                          {on && <Check size={12} className="text-white" />}
                        </span>
                        <span className="truncate">{m.name}</span>
                      </button>
                    );
                  })}
                  {people.length === 0 && <p className="px-1 text-xs text-[var(--muted)]">Ninguém encontrado.</p>}
                </div>
              </fieldset>
              {error && <p className="text-sm text-[#ff9b92]" role="alert">{error}</p>}
              <div className="flex justify-end gap-2 pb-2">
                <button type="button" onClick={() => setCreating(false)} className="btn-ghost h-10 px-4 text-sm">
                  Voltar
                </button>
                <button type="submit" disabled={busy || !roomId || Boolean(clash)} className="btn-primary h-10 px-5 text-sm">
                  {busy ? "Reservando…" : "Reservar sala"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <nav className="scroll-thin flex gap-1.5 overflow-x-auto px-4 py-3 sm:px-5" aria-label="Dias">
                {days.map((d, i) => {
                  const n = bookings.filter((b) => sameDay(b.startsAt, d)).length;
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setDayIdx(i)}
                      aria-pressed={i === dayIdx}
                      className={`relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${i === dayIdx ? "bg-[var(--amber)] text-white" : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-white"}`}
                    >
                      {fmtDay(d, new Date(now))}
                      {n > 0 && (
                        <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${i === dayIdx ? "bg-white/25" : "bg-[var(--amber)]/25 text-white"}`}>{n}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
              <ul className="space-y-2 px-4 pb-4 sm:px-5">
                {dayBookings.length === 0 && (
                  <li className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-[var(--muted)]">
                    Nenhuma sala reservada {dayIdx === 0 ? "hoje" : "neste dia"}.
                    <button type="button" onClick={() => openForm(day)} className="mt-3 block w-full text-[var(--amber)] hover:underline">
                      Reservar uma sala
                    </button>
                  </li>
                )}
                {dayBookings.map((b) => {
                  const room = roomById.get(b.roomId);
                  const live = new Date(b.startsAt).getTime() <= now && new Date(b.endsAt).getTime() > now;
                  const past = new Date(b.endsAt).getTime() <= now;
                  const canCancel = b.createdBy === meId || isManager;
                  const guests = b.attendees.map((id) => nameOf.get(id)).filter(Boolean) as string[];
                  return (
                    <li
                      key={b.id}
                      className={`rounded-xl border px-3 py-3 sm:px-4 ${live ? "border-[var(--amber)]/60 bg-[var(--amber)]/10" : "border-white/10 bg-white/[0.03]"} ${past ? "opacity-55" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white">
                            {live && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--coral)]" aria-label="Acontecendo agora" />}
                            <span className="truncate">{b.title}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {fmtTime(b.startsAt)}–{fmtTime(b.endsAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <DoorOpen size={12} /> {room?.name ?? "Sala"}
                            </span>
                            <span>por {b.createdBy === meId ? "você" : b.createdByName}</span>
                          </div>
                          {guests.length > 0 && (
                            <div className="mt-1 flex items-start gap-1 text-xs text-[var(--muted)]">
                              <Users size={12} className="mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{guests.join(", ")}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {room && !past && (
                            <a
                              href={googleCalendarUrl(b, room.name, officeUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                              title="Adicionar ao Google Agenda"
                              aria-label={`Adicionar “${b.title}” ao Google Agenda`}
                            >
                              <CalendarPlus size={15} />
                            </a>
                          )}
                          {canCancel && !past && (
                            <button
                              type="button"
                              disabled={cancelling === b.id}
                              onClick={async () => {
                                if (!window.confirm(`Cancelar a reserva “${b.title}”?`)) return;
                                setCancelling(b.id);
                                await onCancel(b.id);
                                setCancelling(null);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-[var(--muted)] hover:bg-[#3a2228] hover:text-[#ff9b92] disabled:opacity-40"
                              title="Cancelar a reserva"
                              aria-label={`Cancelar a reserva “${b.title}”`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          {room && live && (
                            <button type="button" onClick={() => onJoin(room)} className="btn-primary h-8 px-3 text-xs">
                              Entrar
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
