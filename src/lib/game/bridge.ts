/**
 * Ponte entre o React (rede, mídia, UI) e a cena Phaser.
 * O React escreve o estado desejado aqui; a cena lê a cada quadro.
 * A cena devolve eventos (movimento local, mudança de zona) por callbacks.
 * Não importa Phaser — pode ser usada em qualquer lugar.
 */
import type { AvatarConfig } from "@/lib/avatar";
import type { Dir } from "./art/characters";
import { type Interaction, SPAWN } from "./map";

export interface RoomDecorInfo {
  zoneKey: string;
  name: string;
  theme: string | null;
  logoUrl?: string | null;
}

export interface RemoteView {
  id: string;
  name: string;
  avatar: AvatarConfig;
  /** Posição-alvo recebida da rede (a cena interpola até ela). */
  tx: number;
  ty: number;
  dir: Dir;
  moving: boolean;
  mic: boolean;
  speaking: boolean;
  /** Em chamada de sala de reunião. */
  inMeeting: boolean;
  /** Conectado por proximidade com o jogador local. */
  near: boolean;
  /** Emoji(s) antes do nome: status e mão levantada. */
  badge: string;
  /** O que está na mão (café, água...). */
  item: string | null;
  /** Timestamp da última atualização de posição (ms). */
  updatedAt: number;
}

export interface LocalView {
  id: string;
  name: string;
  avatar: AvatarConfig;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  mic: boolean;
  speaking: boolean;
  badge: string;
  item: string | null;
}

export type DeskHandler = (desk: { index: number; x: number; y: number; dir: Dir }) => void;

export type LocalMoveHandler = (s: { x: number; y: number; dir: Dir; moving: boolean }) => void;
export type ZoneHandler = (zoneKey: string | null) => void;
export type SeatHandler = (seat: { zoneKey: string; x: number; y: number; dir: Dir }) => void;

export class GameBridge {
  remotes = new Map<string, RemoteView>();
  local: LocalView;
  /** Movimento por teclado habilitado (falso quando um campo de texto tem foco). */
  inputEnabled = true;
  /** Vetor do joystick de toque (−1..1). */
  touch = { x: 0, y: 0 };
  showNames = true;
  zoom = 1;
  /** Raio de proximidade, desenhado em volta do jogador local. */
  proximityRadius = 128;
  pendingTeleport: { x: number; y: number; dir?: Dir } | null = null;
  /** Preso no lugar (sentado numa reunião): ignora teclado e joystick. */
  locked = false;

  onLocalMove: LocalMoveHandler | null = null;
  onZoneChange: ZoneHandler | null = null;
  onReady: (() => void) | null = null;
  onSeatClick: SeatHandler | null = null;
  onDeskClick: DeskHandler | null = null;
  onItemClick: ((i: Interaction) => void) | null = null;
  /** Socos a animar (a cena consome a fila). */
  punches: { from: string; to: string }[] = [];
  /** Pulos de outras pessoas a animar. */
  jumps: string[] = [];
  onLocalJump: (() => void) | null = null;
  /** Zoom mudou por gesto de pinça (celular). */
  onPinchZoom: ((z: number) => void) | null = null;
  /** Reações a mostrar (a cena consome a fila). */
  reactions: { id: string; emoji: string }[] = [];
  /** Nome do dono de cada mesa (índice da mesa → nome, ou ""). */
  deskNames: string[] = [];
  deskVersion = 0;

  constructor(local: { id: string; name: string; avatar: AvatarConfig; x?: number; y?: number }) {
    this.local = {
      id: local.id,
      name: local.name,
      avatar: local.avatar,
      x: local.x ?? SPAWN.x,
      y: local.y ?? SPAWN.y,
      dir: "down",
      moving: false,
      mic: false,
      speaking: false,
      badge: "",
      item: null,
    };
  }

  setLocalBadge(b: string) {
    this.local.badge = b;
  }
  /** Placas e banners das salas (nome + identidade visual). */
  roomDecor: RoomDecorInfo[] = [];
  /** Logo da empresa (painel na parede da entrada). */
  officeLogo: string | null = null;
  roomDecorVersion = 0;
  setRoomDecor(list: RoomDecorInfo[], officeLogo: string | null = null) {
    this.roomDecor = list;
    this.officeLogo = officeLogo;
    this.roomDecorVersion++;
  }
  setLocalItem(item: string | null) {
    this.local.item = item;
  }
  pushJump(id: string) {
    this.jumps.push(id);
    if (this.jumps.length > 20) this.jumps.shift();
  }
  pushPunch(from: string, to: string) {
    this.punches.push({ from, to });
    if (this.punches.length > 20) this.punches.shift();
  }
  pushReaction(id: string, emoji: string) {
    this.reactions.push({ id, emoji });
    if (this.reactions.length > 30) this.reactions.shift();
  }
  setDeskNames(names: string[]) {
    this.deskNames = names;
    this.deskVersion++;
  }

  upsertRemote(id: string, patch: Partial<RemoteView> & { name: string; avatar: AvatarConfig }) {
    const prev = this.remotes.get(id);
    if (prev) {
      Object.assign(prev, patch);
    } else {
      this.remotes.set(id, {
        id,
        tx: SPAWN.x,
        ty: SPAWN.y,
        dir: "down",
        moving: false,
        mic: false,
        speaking: false,
        inMeeting: false,
        near: false,
        badge: "",
        item: null,
        updatedAt: 0,
        ...patch,
      });
    }
  }

  moveRemote(id: string, x: number, y: number, dir: Dir, moving: boolean, at: number) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (at < r.updatedAt) return; // descarta pacotes fora de ordem
    r.tx = x;
    r.ty = y;
    r.dir = dir;
    r.moving = moving;
    r.updatedAt = at;
  }

  removeRemote(id: string) {
    this.remotes.delete(id);
  }

  // Métodos de escrita (usados pelo React; evitam mutação direta em componentes).
  setTouch(x: number, y: number) {
    this.touch = { x, y };
  }
  setInputEnabled(v: boolean) {
    this.inputEnabled = v;
  }
  setShowNames(v: boolean) {
    this.showNames = v;
  }
  setProximityRadius(r: number) {
    this.proximityRadius = r;
  }
  setZoom(z: number) {
    this.zoom = z;
  }
  setLocalMic(on: boolean) {
    this.local.mic = on;
  }
  setRemoteNear(id: string, near: boolean) {
    const r = this.remotes.get(id);
    if (r) r.near = near;
  }
  teleport(x: number, y: number, dir?: Dir) {
    this.pendingTeleport = { x, y, dir };
  }
  setLocked(v: boolean) {
    this.locked = v;
  }
  setHandlers(h: {
    onLocalMove?: LocalMoveHandler | null;
    onZoneChange?: ZoneHandler | null;
    onReady?: (() => void) | null;
    onSeatClick?: SeatHandler | null;
    onDeskClick?: DeskHandler | null;
    onItemClick?: ((i: Interaction) => void) | null;
    onLocalJump?: (() => void) | null;
    onPinchZoom?: ((z: number) => void) | null;
  }) {
    if (h.onLocalJump !== undefined) this.onLocalJump = h.onLocalJump;
    if (h.onPinchZoom !== undefined) this.onPinchZoom = h.onPinchZoom;
    if (h.onItemClick !== undefined) this.onItemClick = h.onItemClick;
    if (h.onDeskClick !== undefined) this.onDeskClick = h.onDeskClick;
    if (h.onSeatClick !== undefined) this.onSeatClick = h.onSeatClick;
    if (h.onLocalMove !== undefined) this.onLocalMove = h.onLocalMove;
    if (h.onZoneChange !== undefined) this.onZoneChange = h.onZoneChange;
    if (h.onReady !== undefined) this.onReady = h.onReady;
  }

  setSpeaking(ids: Set<string>) {
    this.local.speaking = ids.has(this.local.id);
    for (const r of this.remotes.values()) r.speaking = ids.has(r.id);
  }
}
