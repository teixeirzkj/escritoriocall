import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, parseAvatar } from "@/lib/avatar";
import { TILE } from "@/lib/game/map";
import { APPROACH_MARGIN, computeProximity, sameAcousticSpace } from "@/lib/game/proximity";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";

// Pontos de referência (px)
const WORK = { x: 6 * TILE, y: 20 * TILE }; // área de trabalho
const SALA1 = { x: 19 * TILE, y: 7 * TILE }; // dentro da Sala 01
const CORR = { x: 19 * TILE, y: 10.8 * TILE }; // corredor, logo abaixo da Sala 01

describe("proximidade", () => {
  it("cutoff: conecta dentro do raio e desconecta fora", () => {
    const me = { ...WORK, roomId: null };
    const [near, far] = computeProximity(
      me,
      [
        { id: "a", x: WORK.x + 100, y: WORK.y, roomId: null },
        { id: "b", x: WORK.x + 200, y: WORK.y, roomId: null },
      ],
      128,
      "cutoff",
    );
    expect(near).toMatchObject({ id: "a", connected: true, volume: 1 });
    expect(far).toMatchObject({ id: "b", connected: false, volume: 0 });
  });

  it("fade: volume cai com a distância e zera além de 1,5× o raio", () => {
    const me = { ...WORK, roomId: null };
    const res = computeProximity(
      me,
      [
        { id: "perto", x: WORK.x + 40, y: WORK.y, roomId: null },
        { id: "meio", x: WORK.x + 128, y: WORK.y, roomId: null },
        { id: "longe", x: WORK.x + 300, y: WORK.y, roomId: null },
      ],
      128,
      "fade",
    );
    expect(res[0].volume).toBe(1);
    expect(res[1].volume).toBeGreaterThan(0.2);
    expect(res[1].volume).toBeLessThan(1);
    expect(res[2]).toMatchObject({ connected: false, volume: 0 });
  });

  it("paredes de sala isolam: quem está fora não ouve quem está dentro", () => {
    expect(sameAcousticSpace(SALA1.x, SALA1.y, CORR.x, CORR.y)).toBe(false);
    const [r] = computeProximity({ ...CORR, roomId: null }, [{ id: "x", ...SALA1, roomId: null }], 400, "cutoff");
    expect(r.connected).toBe(false);
  });

  it("duas pessoas na mesma sala se ouvem por proximidade", () => {
    const [r] = computeProximity(
      { ...SALA1, roomId: null },
      [{ id: "x", x: SALA1.x + 50, y: SALA1.y, roomId: null }],
      128,
      "cutoff",
    );
    expect(r.connected).toBe(true);
  });

  it("quem está em chamada de reunião fica fora da proximidade", () => {
    const res = computeProximity(
      { ...WORK, roomId: "sala" },
      [{ id: "x", x: WORK.x + 10, y: WORK.y, roomId: null }],
      128,
      "cutoff",
    );
    expect(res[0].connected).toBe(false);
    const res2 = computeProximity(
      { ...WORK, roomId: null },
      [{ id: "x", x: WORK.x + 10, y: WORK.y, roomId: "sala" }],
      128,
      "cutoff",
    );
    expect(res2[0].connected).toBe(false);
  });
});

describe("avatar", () => {
  it("aceita configuração válida", () => {
    const a = { ...DEFAULT_AVATAR, hairStyle: "cacheado", accessory: "oculos" };
    expect(parseAvatar(a)).toEqual(a);
  });
  it("rejeita valores fora da paleta e usa o padrão", () => {
    expect(parseAvatar({ ...DEFAULT_AVATAR, skin: "#000000" })).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar("<script>")).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar(null)).toEqual(DEFAULT_AVATAR);
  });
});

describe("segurança de redirecionamento", () => {
  it("aceita só caminhos internos", () => {
    expect(safeNext("/escritorio/sede")).toBe("/escritorio/sede");
    expect(safeNext("https://malicioso.com")).toBe("/escritorio");
    expect(safeNext("//malicioso.com")).toBe("/escritorio");
    expect(safeNext("/\\malicioso.com")).toBe("/escritorio");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });
});

describe("limite de frequência", () => {
  it("bloqueia após exceder o limite na janela", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000).ok).toBe(true);
    const r = rateLimit(key, 3, 1000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });
});

describe("caixa de som: links", () => {
  it("aceita os formatos de link do YouTube", async () => {
    const { parseMusicUrl } = await import("@/lib/music");
    for (const u of [
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      "https://youtu.be/jNQXAC9IVRw?si=abc",
      "https://m.youtube.com/watch?v=jNQXAC9IVRw&t=10",
      "https://music.youtube.com/watch?v=jNQXAC9IVRw",
      "https://www.youtube.com/shorts/jNQXAC9IVRw",
    ]) {
      expect(parseMusicUrl(u), u).toMatchObject({ ok: true, kind: "youtube", videoId: "jNQXAC9IVRw" });
    }
  });

  it("aceita arquivo de áudio e recusa Spotify, http e lixo", async () => {
    const { parseMusicUrl } = await import("@/lib/music");
    expect(parseMusicUrl("https://exemplo.com/som/musica.mp3")).toMatchObject({ ok: true, kind: "audio" });
    expect(parseMusicUrl("https://open.spotify.com/track/123").ok).toBe(false);
    expect(parseMusicUrl("http://youtu.be/jNQXAC9IVRw").ok).toBe(false);
    expect(parseMusicUrl("javascript:alert(1)").ok).toBe(false);
    expect(parseMusicUrl("https://exemplo.com/pagina").ok).toBe(false);
  });

  it("posição da música considera pausa e tempo decorrido", async () => {
    const { musicPositionMs } = await import("@/lib/music");
    const base = { url: "u", kind: "youtube" as const, videoId: "x", title: null, by: "a" };
    expect(musicPositionMs({ ...base, startedAt: 1000, offsetMs: 5000, paused: false }, 4000)).toBe(8000);
    expect(musicPositionMs({ ...base, startedAt: 1000, offsetMs: 5000, paused: true }, 9000)).toBe(5000);
  });
});

describe("não perturbe", () => {
  it("quem está em 'Não perturbe' não conecta por proximidade (nos dois sentidos)", () => {
    const P = { x: 6 * TILE, y: 20 * TILE };
    const [a] = computeProximity({ ...P, roomId: null, dnd: true }, [{ id: "x", x: P.x + 10, y: P.y, roomId: null }], 200, "cutoff");
    const [b] = computeProximity({ ...P, roomId: null }, [{ id: "x", x: P.x + 10, y: P.y, roomId: null, dnd: true }], 200, "cutoff");
    expect(a.connected).toBe(false);
    expect(b.connected).toBe(false);
  });
});

describe("conexão só com alguém por perto", () => {
  const me = { x: 1000, y: 352, roomId: null };
  it("marca quem está chegando (um pouco além do alcance da voz)", () => {
    const [a, b, c] = computeProximity(
      me,
      [
        { id: "a", x: 1100, y: 352, roomId: null },
        { id: "b", x: 1000 + 200 * 1.5 + APPROACH_MARGIN - 10, y: 352, roomId: null },
        { id: "c", x: 1000 + 200 * 1.5 + APPROACH_MARGIN + 40, y: 352, roomId: null },
      ],
      200,
      "fade",
    );
    expect(a).toMatchObject({ connected: true, approaching: true });
    expect(b).toMatchObject({ connected: false, approaching: true });
    expect(c).toMatchObject({ connected: false, approaching: false });
  });
  it("ninguém chega perto de quem está em reunião ou em Não perturbe", () => {
    const [r] = computeProximity({ ...me, roomId: "sala" }, [{ id: "a", x: 1010, y: 352, roomId: null }], 200, "fade");
    const [d] = computeProximity(me, [{ id: "a", x: 1010, y: 352, roomId: null, dnd: true }], 200, "cutoff");
    expect(r.approaching).toBe(false);
    expect(d.approaching).toBe(false);
  });
});
