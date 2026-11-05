import { describe, expect, it } from "vitest";
import {
  boxBlocked,
  buildCollisionGrid,
  COLL,
  COLL_H,
  COLL_W,
  ITEM_DEFS,
  ITEMS,
  MAP_H,
  MAP_W,
  MEETING_ZONES,
  moveWithCollision,
  nearestFree,
  SPAWN,
  TILE,
  WORLD_H,
  WORLD_W,
  SEATS,
  ZONES,
  zoneAtPoint,
} from "@/lib/game/map";

const grid = buildCollisionGrid();

/** BFS sobre a grade de colisão (passos de 8px) a partir de um ponto. */
function reachable(from: { x: number; y: number }) {
  const seen = new Uint8Array(COLL_W * COLL_H);
  const sx = Math.round(from.x / COLL);
  const sy = Math.round(from.y / COLL);
  const queue: number[] = [sx, sy];
  seen[sy * COLL_W + sx] = 1;
  while (queue.length) {
    const y = queue.pop()!;
    const x = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= COLL_W - 1 || ny >= COLL_H - 1) continue;
      if (seen[ny * COLL_W + nx]) continue;
      if (boxBlocked(grid, nx * COLL, ny * COLL)) continue;
      seen[ny * COLL_W + nx] = 1;
      queue.push(nx, ny);
    }
  }
  return seen;
}

describe("mapa", () => {
  it("tem as dimensões esperadas", () => {
    expect(WORLD_W).toBe(MAP_W * TILE);
    expect(WORLD_H).toBe(MAP_H * TILE);
  });

  it("o ponto de nascimento está livre e na área de trabalho", () => {
    expect(boxBlocked(grid, SPAWN.x, SPAWN.y)).toBe(false);
    expect(zoneAtPoint(SPAWN.x, SPAWN.y)?.key).toBe("trabalho");
  });

  it("todos os móveis estão dentro do mundo", () => {
    for (const it of ITEMS) {
      const def = ITEM_DEFS[it.type];
      expect(it.x * TILE).toBeGreaterThanOrEqual(0);
      expect(it.y * TILE).toBeGreaterThanOrEqual(0);
      expect(it.x * TILE + (it.tw ? it.tw * TILE : def.w)).toBeLessThanOrEqual(WORLD_W);
      expect(it.y * TILE + (it.th ? it.th * TILE : def.h)).toBeLessThanOrEqual(WORLD_H);
    }
  });

  it("todas as áreas (salas, copa, corredor) são alcançáveis a partir da entrada", () => {
    const seen = reachable(SPAWN);
    for (const z of ZONES) {
      let ok = false;
      for (let ty = z.y1; ty <= z.y2 && !ok; ty++) {
        for (let tx = z.x1; tx <= z.x2 && !ok; tx++) {
          const cx = Math.round(((tx + 0.5) * TILE) / COLL);
          const cy = Math.round(((ty + 0.5) * TILE) / COLL);
          if (seen[cy * COLL_W + cx]) ok = true;
        }
      }
      expect(ok, `zona inalcançável: ${z.key}`).toBe(true);
    }
  });

  it("existe espaço livre suficiente em cada sala de reunião para a capacidade padrão", () => {
    const seen = reachable(SPAWN);
    for (const z of MEETING_ZONES) {
      let freeTiles = 0;
      for (let ty = z.y1; ty <= z.y2; ty++)
        for (let tx = z.x1; tx <= z.x2; tx++) {
          const cx = Math.round(((tx + 0.5) * TILE) / COLL);
          const cy = Math.round(((ty + 0.5) * TILE) / COLL);
          if (seen[cy * COLL_W + cx]) freeTiles++;
        }
      expect(freeTiles, z.key).toBeGreaterThanOrEqual(z.defaultCapacity ?? 1);
    }
  });
});

describe("assentos", () => {
  it("cada sala de reunião tem cadeiras clicáveis, livres e dentro da própria sala", () => {
    const seen = reachable(SPAWN);
    for (const z of MEETING_ZONES) {
      const seats = SEATS.filter((s) => s.zoneKey === z.key);
      expect(seats.length, z.key).toBeGreaterThanOrEqual(Math.min(2, z.defaultCapacity ?? 2));
      expect(seats.length, `${z.key}: cadeiras = capacidade`).toBe(z.defaultCapacity);
      for (const s of seats) {
        const free = nearestFree(grid, s.x, s.y);
        expect(zoneAtPoint(free.x, free.y - 4)?.key, z.key).toBe(z.key);
        expect(seen[Math.round(free.y / COLL) * COLL_W + Math.round(free.x / COLL)], z.key).toBe(1);
      }
    }
  });

  it("a porta de cada sala fica no corredor e é alcançável", () => {
    for (const z of MEETING_ZONES) {
      expect(z.door, z.key).toBeTruthy();
      const p = nearestFree(grid, z.door!.x * TILE, z.door!.y * TILE);
      expect(zoneAtPoint(p.x, p.y - 4)?.key, z.key).toBe("corredor");
    }
  });
});

describe("colisão", () => {
  it("não atravessa paredes, mesmo com passo grande", () => {
    // Do corredor (y≈10.5) para cima, fora de uma porta: a parede (y=9) bloqueia.
    const start = { x: 3.5 * TILE, y: 11.5 * TILE };
    const end = moveWithCollision(grid, start.x, start.y, 0, -400);
    expect(end.y).toBeGreaterThan(10 * TILE);
  });

  it("passa pela porta da Sala Principal", () => {
    const start = { x: 8 * TILE, y: 11.5 * TILE };
    let p = start;
    for (let i = 0; i < 40; i++) p = moveWithCollision(grid, p.x, p.y, 0, -8);
    expect(zoneAtPoint(p.x, p.y - 4)?.key).toBe("sala-principal");
  });

  it("desliza ao longo da parede em movimento diagonal", () => {
    const start = { x: 3.5 * TILE, y: 10.6 * TILE };
    const end = moveWithCollision(grid, start.x, start.y, 40, -40);
    expect(end.x).toBeGreaterThan(start.x);
  });

  it("nearestFree encontra posição livre perto de um ponto bloqueado", () => {
    const p = nearestFree(grid, 40, 40);
    expect(boxBlocked(grid, p.x, p.y)).toBe(false);
  });
});

describe("objetos clicáveis", () => {
  it("toda geladeira, cafeteira, jogo e assento tem um ponto alcançável na frente", async () => {
    const { INTERACTIONS } = await import("@/lib/game/map");
    const seen = reachable(SPAWN);
    const kinds = new Set(INTERACTIONS.map((i) => i.kind));
    for (const k of ["sit", "fridge", "coffee", "vending", "water", "game"]) expect(kinds.has(k as never), k).toBe(true);
    for (const i of INTERACTIONS) {
      const p = nearestFree(grid, i.x, i.y);
      expect(Math.hypot(p.x - i.x, p.y - i.y), `${i.type} em ${i.item.x},${i.item.y}`).toBeLessThan(40);
      const cells = [Math.floor, Math.ceil].flatMap((fy) => [Math.floor, Math.ceil].map((fx) => seen[fy(p.y / COLL) * COLL_W + fx(p.x / COLL)]));
      expect(cells.some((c) => c === 1), `${i.type} alcançável`).toBe(true);
    }
  });
});
