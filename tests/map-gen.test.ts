import { describe, expect, it } from "vitest";
import * as M from "@/lib/game/map";
import type { LayoutSpec } from "@/lib/game/map";

/** BFS sobre a grade de colisão (passos de 8px) a partir de um ponto. */
function reachable(grid: Uint8Array, from: { x: number; y: number }) {
  const W = M.COLL_W;
  const H = M.COLL_H;
  const seen = new Uint8Array(W * H);
  const sx = Math.round(from.x / M.COLL);
  const sy = Math.round(from.y / M.COLL);
  const queue: number[] = [sx, sy];
  seen[sy * W + sx] = 1;
  while (queue.length) {
    const y = queue.pop()!;
    const x = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      if (seen[ny * W + nx]) continue;
      if (M.boxBlocked(grid, nx * M.COLL, ny * M.COLL)) continue;
      seen[ny * W + nx] = 1;
      queue.push(nx, ny);
    }
  }
  return seen;
}
const isSeen = (seen: Uint8Array, p: { x: number; y: number }) =>
  [Math.floor, Math.ceil].some((fy) => [Math.floor, Math.ceil].some((fx) => seen[fy(p.y / M.COLL) * M.COLL_W + fx(p.x / M.COLL)] === 1));

const rooms = (...seats: number[]) => seats.map((s, i) => ({ key: `sala-${String(i + 1).padStart(2, "0")}`, seats: s }));

const CASES: [string, LayoutSpec][] = [
  ["padrão", { ...M.DEFAULT_LAYOUT, rooms: rooms(12, 6, 4, 2) }],
  ["sem salas", { ...M.DEFAULT_LAYOUT, rooms: [] }],
  ["uma sala de 1", { desks: 2, kitchen: false, pool: false, games: false, rooms: rooms(1) }],
  ["salas grandes", { desks: 40, kitchen: true, pool: true, games: false, rooms: rooms(24, 13, 20, 12, 7) }],
  ["muitas salas", { desks: 8, kitchen: true, pool: false, games: true, rooms: rooms(2, 3, 4, 5, 6, 8, 10, 12, 1, 2, 6, 9) }],
  ["ímpares", { desks: 7, kitchen: true, pool: true, games: true, rooms: rooms(3, 5, 9, 11, 15) }],
  ["só jogos", { desks: 20, kitchen: false, pool: false, games: true, rooms: rooms(6, 6) }],
];

describe.each(CASES)("mapa gerado: %s", (_name, spec) => {
  M.applyOfficeMap(spec);
  const grid = M.buildCollisionGrid();
  const seen = reachable(grid, M.SPAWN);

  it("nasce livre na área de trabalho e tudo cabe no mundo", () => {
    M.applyOfficeMap(spec);
    expect(M.boxBlocked(grid, M.SPAWN.x, M.SPAWN.y)).toBe(false);
    expect(M.zoneAtPoint(M.SPAWN.x, M.SPAWN.y)?.key).toBe("trabalho");
    for (const it of M.ITEMS) {
      const def = M.ITEM_DEFS[it.type];
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.y).toBeGreaterThanOrEqual(0);
      expect(it.x * M.TILE + (it.tw ? it.tw * M.TILE : def.w)).toBeLessThanOrEqual(M.WORLD_W);
      expect(it.y * M.TILE + (it.th ? it.th * M.TILE : def.h)).toBeLessThanOrEqual(M.WORLD_H);
    }
  });

  it("toda área é alcançável a partir da entrada", () => {
    M.applyOfficeMap(spec);
    for (const z of M.ZONES) {
      let ok = false;
      for (let ty = z.y1; ty <= z.y2 && !ok; ty++)
        for (let tx = z.x1; tx <= z.x2 && !ok; tx++) if (isSeen(seen, { x: (tx + 0.5) * M.TILE, y: (ty + 0.5) * M.TILE })) ok = true;
      expect(ok, `zona inalcançável: ${z.key}`).toBe(true);
    }
  });

  it("cada sala tem exatamente as cadeiras pedidas, alcançáveis e dentro dela", () => {
    M.applyOfficeMap(spec);
    expect(M.MEETING_ZONES.map((z) => z.key).sort()).toEqual(spec.rooms.map((r) => r.key).sort());
    for (const r of spec.rooms) {
      const seats = M.seatsOf(r.key);
      expect(seats.length, r.key).toBe(r.seats);
      for (const s of seats) {
        const free = M.nearestFree(grid, s.x, s.y);
        expect(M.zoneAtPoint(free.x, free.y - 4)?.key, r.key).toBe(r.key);
        expect(isSeen(seen, free), `${r.key}: cadeira em ${s.x},${s.y}`).toBe(true);
      }
      const z = M.zoneByKey(r.key)!;
      const p = M.nearestFree(grid, z.door!.x * M.TILE, z.door!.y * M.TILE);
      expect(M.zoneAtPoint(p.x, p.y - 4)?.key, `${r.key}: porta`).toBe("corredor");
      expect(M.ROOM_DECOR[r.key], r.key).toBeTruthy();
      const tv = M.ITEMS.find((it) => it.type === "tv" && it.x >= z.x1 && it.x <= z.x2 && it.y <= z.y1 && it.y >= z.y1 - 1.5);
      expect(tv, `${r.key}: TV para a logo`).toBeTruthy();
    }
  });

  it("mesas de trabalho = lugares pedidos (arredondado para par)", () => {
    M.applyOfficeMap(spec);
    expect(M.DESK_SEATS.length).toBe(Math.ceil(Math.max(2, spec.desks) / 2) * 2);
    for (const d of M.DESK_SEATS) expect(isSeen(seen, M.nearestFree(grid, d.x, d.y)), `mesa ${d.x},${d.y}`).toBe(true);
  });

  it("objetos clicáveis têm um ponto alcançável na frente", () => {
    M.applyOfficeMap(spec);
    for (const i of M.INTERACTIONS) {
      const p = M.nearestFree(grid, i.x, i.y);
      expect(Math.hypot(p.x - i.x, p.y - i.y), `${i.type} em ${i.item.x},${i.item.y}`).toBeLessThan(40);
      expect(isSeen(seen, p), `${i.type} em ${i.item.x},${i.item.y} alcançável`).toBe(true);
    }
  });

  it("área de lazer e copa só existem quando pedidas", () => {
    M.applyOfficeMap(spec);
    expect(Boolean(M.zoneByKey("lazer"))).toBe(spec.pool || spec.games);
    expect(Boolean(M.zoneByKey("copa"))).toBe(spec.kitchen);
    expect(M.MAP.floor.flat().includes(M.Floor.Pool)).toBe(spec.pool);
  });
});

describe("mapa clássico continua igual", () => {
  it("52x24 com as 4 salas originais", () => {
    M.applyOfficeMap(null);
    expect([M.MAP_W, M.MAP_H]).toEqual([52, 24]);
    expect(M.MEETING_ZONE_KEYS).toEqual(["sala-principal", "sala-01", "sala-02", "sala-03"]);
  });
});
