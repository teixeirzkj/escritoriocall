/** Nomes de canais Ably e salas LiveKit (compartilhado cliente/servidor). */

export const ch = {
  /** Presença + movimentação (clientes publicam). */
  office: (officeId: string) => `office:${officeId}`,
  /** Chat geral do escritório (somente servidor publica). */
  chat: (officeId: string) => `office:${officeId}:chat`,
  /** Chat de uma sala (somente servidor publica). */
  room: (officeId: string, roomId: string) => `office:${officeId}:room:${roomId}`,
  /** Caixa de mensagens privadas de um usuário (somente servidor publica). */
  dm: (officeId: string, userId: string) => `office:${officeId}:dm:${userId}`,
  /** Comandos administrativos (expulsão, atualização de salas). */
  control: (officeId: string) => `office:${officeId}:control`,
};

export const lk = {
  proximity: (officeId: string) => `${officeId}--prox`,
  room: (officeId: string, roomId: string) => `${officeId}--room--${roomId}`,
};

/** Sessão de mídia no Cloudflare (o que a pessoa publica): sessão, passe e nome das faixas. */
export interface RtcInfo {
  s: string;
  tk: string;
  mic?: string;
  cam?: string;
  screen?: string;
}

/** Dados publicados na presença Ably por cada participante. */
export interface PresenceData {
  name: string;
  avatar: unknown;
  x: number;
  y: number;
  dir: "down" | "left" | "right" | "up";
  zone: string | null;
  /** id da sala (reunião) em que está conectado. */
  roomId: string | null;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  /** Status de disponibilidade (ver lib/status). */
  status?: string;
  /** Mão levantada (reunião). */
  hand?: boolean;
  /** Emoji do que a pessoa está segurando (café, suco...) ou jogando. */
  item?: string | null;
  /** Mesa de jogo em que está (ex.: "pingPong-0"). */
  game?: string | null;
  /** Identificador da aba para resolver conexões duplicadas. */
  tab: string;
  /** Áudio/vídeo pelo Cloudflare: de onde receber as faixas desta pessoa. */
  rtc?: RtcInfo | null;
}

/** Mensagem compacta de movimento. */
export interface MoveMsg {
  x: number;
  y: number;
  d: 0 | 1 | 2 | 3;
  m: 0 | 1;
  t: number;
}

export const DIR_CODES = ["down", "left", "right", "up"] as const;

export type ControlMsg =
  | { type: "kick"; userId: string; reason?: string }
  | { type: "rooms-updated" }
  | { type: "office-updated" }
  | { type: "bookings-updated" }
  /** Recomeçar as sessões de mídia (Cloudflare) de quem está nessas salas (null = proximidade). */
  | { type: "media-reset"; roomIds: (string | null)[] };

/**
 * Mensagens dos jogos de mesa (pingue-pongue / totó), no canal do escritório.
 * "host" simula a partida e manda o estado; "guest" manda a posição da raquete.
 */
export type GameMsg =
  | { k: "join"; table: string; to: string }
  | { k: "start"; table: string; to: string }
  | { k: "state"; table: string; to: string; s: number[] }
  | { k: "paddle"; table: string; to: string; y: number }
  | { k: "leave"; table: string; to: string }
  /** Sinuca 8 ball: mira, tacada e estado da mesa (validado no componente). */
  | { k: "pool"; table: string; to: string; d: unknown };

/** Reação rápida (emoji) publicada no canal do escritório. */
export interface ReactionMsg {
  e: string;
  roomId: string | null;
}

/** Chamado ("Fulano está te chamando"), enviado pelo servidor na caixa da pessoa. */
export interface RingMsg {
  fromId: string;
  fromName: string;
  where: string;
  roomId: string | null;
}

/** Alguém bateu na porta de uma sala trancada. */
export interface KnockMsg {
  fromId: string;
  fromName: string;
  roomId: string;
}

/** Resposta à batida (para quem bateu). */
export interface KnockAnswerMsg {
  roomId: string;
  accepted: boolean;
  ticket: string | null;
  byName: string;
}
