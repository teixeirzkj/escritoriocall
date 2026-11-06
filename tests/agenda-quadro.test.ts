import { describe, expect, it } from "vitest";
import { applyBoard, chunkStrokes, EMPTY_BOARD, isSyncResponder, type Stroke } from "@/lib/board";
import { type Booking, dueReminders, googleCalendarUrl, overlaps, roomSchedule } from "@/lib/bookings";

const MIN = 60_000;
const NOW = new Date("2026-11-05T14:00:00-03:00").getTime();
const at = (m: number) => new Date(NOW + m * MIN).toISOString();
const booking = (over: Partial<Booking>): Booking => ({
  id: "b1",
  roomId: "sala-1",
  title: "Alinhamento",
  startsAt: at(10),
  endsAt: at(40),
  createdBy: "ana",
  createdByName: "Ana",
  attendees: ["beto"],
  ...over,
});

describe("agenda das salas", () => {
  it("separa a reserva de agora da próxima", () => {
    const list = [
      booking({ id: "agora", startsAt: at(-10), endsAt: at(20) }),
      booking({ id: "depois", startsAt: at(60), endsAt: at(90) }),
      booking({ id: "outra-sala", roomId: "sala-2", startsAt: at(-5), endsAt: at(5) }),
    ];
    const s = roomSchedule(list, "sala-1", NOW);
    expect(s.current?.id).toBe("agora");
    expect(s.next?.id).toBe("depois");
    expect(roomSchedule(list, "sala-3", NOW)).toEqual({ current: null, next: null });
  });

  it("detecta conflito de horário só na mesma sala", () => {
    const list = [booking({ startsAt: at(0), endsAt: at(30) })];
    expect(overlaps(list, "sala-1", NOW + 15 * MIN, NOW + 45 * MIN)).not.toBeNull();
    expect(overlaps(list, "sala-1", NOW + 30 * MIN, NOW + 60 * MIN)).toBeNull(); // encosta, não sobrepõe
    expect(overlaps(list, "sala-2", NOW, NOW + 30 * MIN)).toBeNull();
  });

  it("avisa convidados e quem criou 5 min antes, uma vez só", () => {
    const b = booking({ startsAt: at(4), endsAt: at(30) });
    const seen = new Set<string>();
    expect(dueReminders([b], "beto", NOW, seen)).toHaveLength(1);
    expect(dueReminders([b], "ana", NOW, seen)).toHaveLength(1);
    expect(dueReminders([b], "carla", NOW, seen)).toHaveLength(0); // não convidada
    expect(dueReminders([booking({ startsAt: at(8) })], "beto", NOW, seen)).toHaveLength(0); // ainda cedo
    seen.add(b.id);
    expect(dueReminders([b], "beto", NOW, seen)).toHaveLength(0);
  });

  it("monta o link do Google Agenda com o horário em UTC", () => {
    const url = new URL(googleCalendarUrl(booking({}), "Sala 01", "https://fredy.app/escritorio/sede"));
    expect(url.searchParams.get("text")).toBe("Alinhamento");
    expect(url.searchParams.get("dates")).toBe("20261105T171000Z/20261105T174000Z");
  });
});

const stroke = (id: string, by: string, n = 2): Stroke => ({ id, by, c: "#000", w: 4, p: Array.from({ length: n * 2 }, (_, i) => i) });

describe("quadro branco", () => {
  it("abre, recebe traços em pedaços e fecha", () => {
    let s = applyBoard(EMPTY_BOARD, "ana", { k: "open", room: "r" }, "eu");
    expect(s.open).toBe(true);
    s = applyBoard(s, "ana", { k: "stroke", room: "r", s: stroke("t1", "ana", 2) }, "eu");
    s = applyBoard(s, "ana", { k: "stroke", room: "r", s: stroke("t1", "ana", 5) }, "eu");
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0].p).toHaveLength(10);
    // Pedaço atrasado (menor) não volta o traço.
    s = applyBoard(s, "ana", { k: "stroke", room: "r", s: stroke("t1", "ana", 3) }, "eu");
    expect(s.strokes[0].p).toHaveLength(10);
    s = applyBoard(s, "beto", { k: "close", room: "r" }, "eu");
    expect(s.open).toBe(false);
    expect(s.strokes).toHaveLength(1); // o desenho continua guardado
  });

  it("ninguém desenha nem desfaz em nome de outra pessoa", () => {
    let s = applyBoard(EMPTY_BOARD, "beto", { k: "stroke", room: "r", s: stroke("t1", "ana") }, "eu");
    expect(s.strokes).toHaveLength(0);
    s = applyBoard(s, "ana", { k: "stroke", room: "r", s: stroke("t1", "ana") }, "eu");
    s = applyBoard(s, "beto", { k: "undo", room: "r", id: "t1" }, "eu");
    expect(s.strokes).toHaveLength(1);
    s = applyBoard(s, "ana", { k: "undo", room: "r", id: "t1" }, "eu");
    expect(s.strokes).toHaveLength(0);
  });

  it("cópia para quem chegou: só para o destinatário e sem duplicar", () => {
    const base = applyBoard(EMPTY_BOARD, "ana", { k: "stroke", room: "r", s: stroke("t1", "ana") }, "eu");
    const sync = { k: "sync" as const, room: "r", to: "eu", open: true, strokes: [stroke("t1", "ana"), stroke("t2", "beto")] };
    const s = applyBoard(base, "ana", sync, "eu");
    expect(s.open).toBe(true);
    expect(s.strokes.map((x) => x.id)).toEqual(["t1", "t2"]);
    expect(applyBoard(base, "ana", { ...sync, to: "outra" }, "eu")).toBe(base);
  });

  it("só uma pessoa responde ao pedido de cópia", () => {
    const sala = ["carla", "ana", "beto"];
    const responders = sala.filter((id) => isSyncResponder(id, "carla", sala));
    expect(responders).toEqual(["ana"]);
  });

  it("divide a cópia em pacotes menores que o limite do Ably", () => {
    const many = Array.from({ length: 60 }, (_, i) => stroke(`t${i}`, "ana", 400));
    const chunks = chunkStrokes(many);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(60);
    for (const c of chunks) expect(JSON.stringify(c).length).toBeLessThan(60_000);
  });
});
