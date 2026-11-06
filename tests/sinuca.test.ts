import { describe, expect, it } from "vitest";
import { aimGuide, type Ball, groupOf, H, newGame, type PoolState, R, rack, resolveShot, simulate, strike, W } from "@/lib/pool8";

const names: [string, string] = ["Ana", "Beto"];
const ball = (n: number, x: number, y: number, inPocket = false): Ball => ({ n, x, y, vx: 0, vy: 0, in: inPocket });

/** Estado com grupos definidos (Ana = lisas) e a mesa já quebrada. */
function midGame(over: Partial<PoolState> = {}): PoolState {
  return { ...newGame(0), broken: true, groups: ["solids", "stripes"], ...over };
}

describe("sinuca 8 ball: mesa", () => {
  it("triângulo com 15 bolas, a 8 no centro e cantos de trás de grupos diferentes", () => {
    const b = rack();
    expect(b).toHaveLength(16);
    expect(new Set(b.map((x) => x.n)).size).toBe(16);
    const objs = b.slice(1);
    const eight = objs.find((x) => x.n === 8)!;
    const row2 = objs.filter((x) => Math.abs(x.x - eight.x) < 0.01);
    expect(row2).toHaveLength(3);
    expect(Math.abs(eight.y - H / 2)).toBeLessThan(0.01);
    const back = objs.filter((x) => Math.abs(x.x - Math.max(...objs.map((o) => o.x))) < 0.01).sort((a, c) => a.y - c.y);
    expect(groupOf(back[0].n)).not.toBe(groupOf(back[4].n));
  });

  it("a quebra espalha as bolas e tudo para sozinho", () => {
    const balls = rack();
    strike(balls, 0, 1);
    const log = { firstHit: null as number | null, potted: [] as number[] };
    simulate(balls, log);
    expect(log.firstHit).toBe(1);
    expect(balls.every((b) => b.vx === 0 && b.vy === 0)).toBe(true);
    for (const b of balls.filter((x) => !x.in)) {
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(W);
    }
  });
});

describe("sinuca 8 ball: regras", () => {
  it("mesa aberta: quem encaçapa primeiro fica com o grupo e continua", () => {
    const st = { ...newGame(0), broken: true };
    const after = st.balls.map((b) => ({ ...b, in: b.n === 3 }));
    const r = resolveShot(st, after, { firstHit: 3, potted: [3] }, names);
    expect(r.groups).toEqual(["solids", "stripes"]);
    expect(r.turn).toBe(0);
    expect(r.msg).toContain("Ana fica com as lisas");
  });

  it("errar passa a vez; encaçapar a do adversário também", () => {
    const st = midGame();
    expect(resolveShot(st, st.balls, { firstHit: 2, potted: [] }, names).turn).toBe(1);
    const after = st.balls.map((b) => ({ ...b, in: b.n === 10 }));
    expect(resolveShot(st, after, { firstHit: 2, potted: [10] }, names).turn).toBe(1);
  });

  it("faltas dão bola na mão ao adversário", () => {
    const st = midGame();
    const wrong = resolveShot(st, st.balls, { firstHit: 12, potted: [] }, names);
    expect(wrong).toMatchObject({ turn: 1, inHand: true });
    expect(wrong.msg).toContain("acertou primeiro a bola do adversário");
    const none = resolveShot(st, st.balls, { firstHit: null, potted: [] }, names);
    expect(none.inHand).toBe(true);
    const after = st.balls.map((b) => ({ ...b, in: b.n === 0 || b.n === 1 }));
    const scratch = resolveShot(st, after, { firstHit: 1, potted: [1, 0] }, names);
    expect(scratch).toMatchObject({ turn: 1, inHand: true });
    expect(scratch.balls[0].in).toBe(false); // a branca volta para a mesa
  });

  it("8 antes da hora perde; 8 depois de limpar o grupo vence", () => {
    const st = midGame();
    const early = st.balls.map((b) => ({ ...b, in: b.n === 8 }));
    expect(resolveShot(st, early, { firstHit: 8, potted: [8] }, names).winner).toBe(1);

    const cleared = midGame({ balls: rack().map((b) => ({ ...b, in: groupOf(b.n) === "solids" })) });
    const win = cleared.balls.map((b) => ({ ...b, in: b.in || b.n === 8 }));
    expect(resolveShot(cleared, win, { firstHit: 8, potted: [8] }, names).winner).toBe(0);
    const winScratch = cleared.balls.map((b) => ({ ...b, in: b.in || b.n === 8 || b.n === 0 }));
    expect(resolveShot(cleared, winScratch, { firstHit: 8, potted: [8, 0] }, names).winner).toBe(1);
  });

  it("8 na quebra volta para a mesa e o jogo segue", () => {
    const st = newGame(0);
    const after = st.balls.map((b) => ({ ...b, in: b.n === 8 }));
    const r = resolveShot(st, after, { firstHit: 1, potted: [8] }, names);
    expect(r.winner).toBeNull();
    expect(r.balls.find((b) => b.n === 8)!.in).toBe(false);
  });
});

describe("sinuca 8 ball: linhas de mira", () => {
  it("batida de frente: a bola atingida segue reta e a branca quase não desvia", () => {
    const balls = [ball(0, 100, 170), ball(5, 300, 170)];
    const g = aimGuide(balls, 0);
    expect(g.target?.n).toBe(5);
    expect(g.end.x).toBeCloseTo(300 - 2 * R, 5);
    expect(g.targetDir!.x).toBeCloseTo(1, 5);
    expect(g.cueDir).toBeNull();
  });

  it("batida de lado: bola vai na linha dos centros e a branca sai a 90°", () => {
    const balls = [ball(0, 100, 170), ball(5, 300, 170 + R)];
    const g = aimGuide(balls, 0);
    const t = g.targetDir!;
    const c = g.cueDir!;
    expect(t.y).toBeGreaterThan(0.3);
    expect(Math.abs(t.x * c.x + t.y * c.y)).toBeLessThan(1e-6); // perpendiculares
  });

  it("sem bola no caminho: a linha vai até a tabela", () => {
    const g = aimGuide([ball(0, 100, 170)], 0);
    expect(g.target).toBeNull();
    expect(g.end.x).toBeCloseTo(W - 26 - R, 5);
    expect(g.cueDir!.x).toBeLessThan(0); // rebote
  });
});
