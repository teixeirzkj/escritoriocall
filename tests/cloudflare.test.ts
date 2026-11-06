import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.CF_REALTIME_APP_ID = "app-teste";
  process.env.CF_REALTIME_APP_SECRET = "segredo-de-teste-bem-comprido";
});

describe("passe da sessão de mídia (Cloudflare)", () => {
  it("assina e confere sessão, sede, sala e pessoa", async () => {
    const { issueRtcTicket, verifyRtcTicket } = await import("@/lib/cf-realtime");
    const tk = issueRtcTicket({ s: "sess1", o: "sede1", r: "sala1", u: "pessoa1" });
    expect(verifyRtcTicket(tk)).toMatchObject({ s: "sess1", o: "sede1", r: "sala1", u: "pessoa1" });
    const prox = issueRtcTicket({ s: "sess2", o: "sede1", r: null, u: "pessoa2" });
    expect(verifyRtcTicket(prox)?.r).toBeNull();
  });

  it("recusa passe adulterado, inválido ou vencido", async () => {
    const { issueRtcTicket, verifyRtcTicket } = await import("@/lib/cf-realtime");
    const tk = issueRtcTicket({ s: "sess1", o: "sede1", r: null, u: "pessoa1" });
    const [data, sig] = tk.split(".");
    // Trocar a sala nos dados sem refazer a assinatura
    const forged = Buffer.from(JSON.stringify({ s: "sess1", o: "sede1", r: "sala-privada", u: "pessoa1", e: Date.now() + 1e6 })).toString("base64url");
    expect(verifyRtcTicket(`${forged}.${sig}`)).toBeNull();
    expect(verifyRtcTicket(`${data}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyRtcTicket("lixo")).toBeNull();
    expect(verifyRtcTicket(undefined)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(verifyRtcTicket(tk)).toBeNull();
    vi.useRealTimers();
  });
});

describe("SDP", () => {
  it("liga o DTX do Opus (silêncio quase não gasta tráfego)", async () => {
    const { withDtx } = await import("@/lib/media/cf-engine");
    const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n";
    const out = withDtx(sdp);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1");
    expect(withDtx(out)).toBe(out);
    expect(withDtx("v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n")).toContain("m=video");
  });
});
