import "server-only";
import Ably from "ably";
import { serverAbly } from "@/lib/env";

let rest: Ably.Rest | null = null;

export function ablyRest(): Ably.Rest {
  if (!rest) rest = new Ably.Rest({ key: serverAbly().apiKey });
  return rest;
}

export async function publishServer(channel: string, name: string, data: unknown) {
  await ablyRest().channels.get(channel).publish(name, data);
}

/** Lista quem está presente em um canal (para o painel de administração). */
export async function presenceMembers(channel: string) {
  const page = await ablyRest().channels.get(channel).presence.get();
  return page.items;
}
