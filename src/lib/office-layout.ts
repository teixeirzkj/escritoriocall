import { z } from "zod";
import {
  buildMap,
  deskSeatsIn,
  GEN_ROOM_KEY,
  type LayoutOptions,
  type LayoutSpec,
  MAX_DESKS,
  MAX_ROOM_SEATS,
  MIN_DESKS,
} from "@/lib/game/map";

export const layoutOptionsSchema = z.object({
  desks: z.coerce.number().int().min(MIN_DESKS).max(MAX_DESKS),
  kitchen: z.boolean(),
  pool: z.boolean(),
  games: z.boolean(),
});

/** `offices.layout` válido, ou null (sede com o mapa clássico). */
export function parseLayout(v: unknown): LayoutOptions | null {
  const r = layoutOptionsSchema.safeParse(v);
  return r.success ? r.data : null;
}

/** Configuração do mapa da sede a partir do banco (null = mapa clássico). */
export function layoutSpecFor(layout: unknown, rooms: { zone_key: string; capacity: number }[]): LayoutSpec | null {
  const o = parseLayout(layout);
  if (!o) return null;
  return {
    ...o,
    rooms: rooms
      .filter((r) => GEN_ROOM_KEY.test(r.zone_key))
      .sort((a, b) => a.zone_key.localeCompare(b.zone_key))
      .map((r) => ({ key: r.zone_key, seats: Math.min(MAX_ROOM_SEATS, r.capacity) })),
  };
}

/** Quantas mesas de trabalho o mapa da sede tem. */
export function deskCountFor(layout: unknown, rooms: { zone_key: string; capacity: number }[]): number {
  return deskSeatsIn(buildMap(layoutSpecFor(layout, rooms))).length;
}
