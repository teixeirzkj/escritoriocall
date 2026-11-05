import "server-only";
import { presenceMembers } from "@/lib/realtime/ably-server";
import { ch, type PresenceData } from "@/lib/realtime/channels";

/** Quem está online no escritório agora (presença do Ably), por id de usuário. */
export async function onlineMembers(officeId: string): Promise<Map<string, PresenceData>> {
  const items = await presenceMembers(ch.office(officeId));
  const m = new Map<string, PresenceData>();
  for (const it of items) if (it.clientId && it.data) m.set(it.clientId, it.data as PresenceData);
  return m;
}

/** A pessoa está, neste momento, na chamada daquela sala? */
export async function isInRoom(officeId: string, userId: string, roomId: string): Promise<boolean> {
  const online = await onlineMembers(officeId);
  return online.get(userId)?.roomId === roomId;
}
