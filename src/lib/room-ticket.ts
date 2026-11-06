import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverSigningSecret } from "@/lib/env";

/**
 * Passe para entrar numa sala trancada (dado quando alguém de dentro abre a porta).
 * Formato: "<expira-em-ms>.<assinatura>" — vale 2 minutos, para uma pessoa e uma sala.
 */
const TTL_MS = 120_000;

function sign(roomId: string, userId: string, exp: number) {
  return createHmac("sha256", serverSigningSecret()).update(`knock:${roomId}:${userId}:${exp}`).digest("base64url");
}

export function issueRoomTicket(roomId: string, userId: string): string {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(roomId, userId, exp)}`;
}

export function verifyRoomTicket(ticket: string | undefined, roomId: string, userId: string): boolean {
  if (!ticket) return false;
  const [expStr, sig] = ticket.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  const want = Buffer.from(sign(roomId, userId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
