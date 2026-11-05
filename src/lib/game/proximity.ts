import { zoneAtPoint } from "./map";

export type ProximityMode = "cutoff" | "fade";

export interface PeerSpatial {
  id: string;
  x: number;
  y: number;
  /** Sala (reunião) em que o participante está conectado, se houver. */
  roomId: string | null;
  /** Em "Não perturbe": não conecta por proximidade. */
  dnd?: boolean;
}

export interface ProximityResult {
  id: string;
  distance: number;
  /** Deve assinar áudio/vídeo deste participante. */
  connected: boolean;
  /** Volume 0..1 a aplicar no áudio. */
  volume: number;
}

/**
 * Duas pessoas compartilham o mesmo "espaço acústico" quando:
 *  - nenhuma está em uma zona de reunião, ou
 *  - ambas estão na MESMA zona de reunião (sem ter entrado na chamada da sala).
 * Assim, quem está do lado de fora de uma sala não ouve quem está dentro.
 */
export function sameAcousticSpace(ax: number, ay: number, bx: number, by: number): boolean {
  const za = zoneAtPoint(ax, ay);
  const zb = zoneAtPoint(bx, by);
  const ma = za?.kind === "meeting" ? za.key : null;
  const mb = zb?.kind === "meeting" ? zb.key : null;
  return ma === mb;
}

export function computeProximity(
  me: { x: number; y: number; roomId: string | null; dnd?: boolean },
  peers: PeerSpatial[],
  radius: number,
  mode: ProximityMode,
): ProximityResult[] {
  return peers.map((p) => {
    const distance = Math.hypot(p.x - me.x, p.y - me.y);
    // Quem está numa chamada de sala não participa da proximidade.
    if (me.roomId || p.roomId || me.dnd || p.dnd || !sameAcousticSpace(me.x, me.y, p.x, p.y)) {
      return { id: p.id, distance, connected: false, volume: 0 };
    }
    if (mode === "cutoff") {
      const connected = distance <= radius;
      return { id: p.id, distance, connected, volume: connected ? 1 : 0 };
    }
    // "fade": volume cheio até 50% do raio, cai suavemente até 0 em 150% do raio.
    const full = radius * 0.5;
    const max = radius * 1.5;
    if (distance >= max) return { id: p.id, distance, connected: false, volume: 0 };
    const volume = distance <= full ? 1 : 1 - (distance - full) / (max - full);
    return { id: p.id, distance, connected: true, volume: Math.max(0.05, Math.min(1, volume)) };
  });
}
