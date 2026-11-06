/** Agenda das salas: tipos e funções puras (usadas no navegador e nos testes). */

export interface Booking {
  id: string;
  roomId: string;
  title: string;
  /** ISO 8601. */
  startsAt: string;
  endsAt: string;
  createdBy: string;
  createdByName: string;
  attendees: string[];
}

/** Aviso antes do início da reunião. */
export const REMIND_BEFORE_MS = 5 * 60_000;

const t = (iso: string) => new Date(iso).getTime();

/** A pessoa participa da reserva (criou ou foi convidada). */
export function isMine(b: Booking, userId: string) {
  return b.createdBy === userId || b.attendees.includes(userId);
}

/** Reserva acontecendo agora numa sala e a próxima (ainda hoje ou depois). */
export function roomSchedule(bookings: Booking[], roomId: string, now: number) {
  const list = bookings.filter((b) => b.roomId === roomId).sort((a, b) => t(a.startsAt) - t(b.startsAt));
  const current = list.find((b) => t(b.startsAt) <= now && t(b.endsAt) > now) ?? null;
  const next = list.find((b) => t(b.startsAt) > now) ?? null;
  return { current, next };
}

/** Reservas que pedem aviso agora: minhas, começando em até 5 minutos (ou já começaram há menos de 10). */
export function dueReminders(bookings: Booking[], userId: string, now: number, seen: Set<string>) {
  return bookings.filter((b) => {
    if (seen.has(b.id) || !isMine(b, userId)) return false;
    const start = t(b.startsAt);
    return start - now <= REMIND_BEFORE_MS && now - start < 10 * 60_000 && t(b.endsAt) > now;
  });
}

/** Horário livre? (para o formulário avisar antes de enviar). */
export function overlaps(bookings: Booking[], roomId: string, start: number, end: number) {
  return bookings.find((b) => b.roomId === roomId && t(b.startsAt) < end && t(b.endsAt) > start) ?? null;
}

export function fmtTime(iso: string | number) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(d: Date, today = new Date()) {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((a - b) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
}

/** Mesmo dia (no fuso do navegador). */
export function sameDay(iso: string, day: Date) {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

/** "AAAAMMDDTHHMMSSZ" para links de agenda. */
function gcalStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Link "adicionar ao Google Agenda" (não precisa de integração nem de login no sistema). */
export function googleCalendarUrl(b: Booking, roomName: string, officeUrl: string) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: b.title,
    dates: `${gcalStamp(b.startsAt)}/${gcalStamp(b.endsAt)}`,
    details: `${roomName} no escritório virtual Frédy\n${officeUrl}`,
    location: officeUrl,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
