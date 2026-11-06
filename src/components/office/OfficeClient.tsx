"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AvatarConfig } from "@/lib/avatar";
import { useChat, type ThreadKey } from "@/lib/chat/useChat";
import { GameBridge } from "@/lib/game/bridge";
import type { GameHandle } from "@/lib/game/createGame";
import { applyOfficeMap, DESK_SEATS, freeSeat, SPAWN, TILE, zoneByKey, type LayoutSpec, type Seat } from "@/lib/game/map";
import { computeProximity, type ProximityMode } from "@/lib/game/proximity";
import { useCfMedia } from "@/lib/media/useCfMedia";
import { useMedia } from "@/lib/media/useMedia";
import { isMusicZone, type MusicEvent } from "@/lib/music";
import { playChime } from "@/lib/sounds";
import type { ControlMsg, KnockAnswerMsg, KnockMsg, ReactionMsg, RingMsg, RtcInfo } from "@/lib/realtime/channels";
import { badgeOf, useOfficeRealtime } from "@/lib/realtime/useOfficeRealtime";
import { loadStatus, saveStatus, type StatusKey, statusInfo } from "@/lib/status";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { RoomInfo, UserSettings } from "@/lib/types";
import { BackgroundDialog } from "./BackgroundDialog";
import { setPresetsEnabled } from "@/lib/media/backgrounds";
import { InviteLink } from "@/components/admin/InviteLink";
import { ChatPanel } from "./ChatPanel";
import { ControlBar } from "./ControlBar";
import { ParticipantsPanel, type ParticipantRow } from "./ParticipantsPanel";
import { PipMeeting } from "./PipMeeting";
import { BookingReminder, DeskPrompt, KnockRequests, RingPrompt } from "./Prompts";
import { AgendaDialog, type NewBooking } from "./AgendaDialog";
import { type Booking, dueReminders, fmtTime, isMine, roomSchedule, sameDay } from "@/lib/bookings";
import { applyBoard, type BoardMsg, type BoardState, chunkStrokes, EMPTY_BOARD, isSyncResponder, type Stroke } from "@/lib/board";
import { ItemDialog, type Treat } from "./ItemDialog";
import { type GameBus, GameDialog, type GameTable } from "./games/GameDialog";
import { INTERACTIONS } from "@/lib/game/map";
import { RoomPrompt } from "./RoomPrompt";
import { SettingsDialog } from "./SettingsDialog";
import { StatusLayer } from "./StatusLayer";
import { TopBar } from "./TopBar";
import { TouchJoystick } from "./TouchJoystick";
import { MeetingRoom } from "./MeetingRoom";
import { type MusicSnapshot, RoomSpeaker } from "./RoomSpeaker";
import { ProximityStrip } from "./VideoTiles";
import { Toasts, useToasts } from "./Toasts";

export interface OfficeClientProps {
  office: {
    id: string;
    slug: string;
    name: string;
    proximityRadius: number;
    proximityMode: ProximityMode;
    maxOnline: number;
    /** Código do link de convite (só para quem administra a sede). */
    inviteCode: string | null;
    /** Logo da empresa. */
    logoUrl: string | null;
    /** Fundos de câmera prontos (só a sede da Tete à tete). */
    brandBackgrounds: boolean;
    /** Serviço de áudio/vídeo (fixo enquanto o componente existe: a chave inclui o serviço). */
    mediaProvider: "cloudflare" | "livekit";
  };
  /** Mapa da sede (null = mapa clássico). */
  layout: LayoutSpec | null;
  rooms: RoomInfo[];
  /** Mesas fixas: índice da mesa → dono. */
  desks: { index: number; userId: string; name: string }[];
  me: { id: string; name: string; avatar: AvatarConfig; isAdmin: boolean; isManager: boolean };
  settings: UserSettings;
}

type Panel = "none" | "participants" | "chat";

export function OfficeClient({ office, layout, rooms, desks, me, settings: initialSettings }: OfficeClientProps) {
  // Antes de tudo: o mapa desta sede (salas, mesas, lazer) vira o mapa atual.
  useState(() => {
    applyOfficeMap(layout);
    setPresetsEnabled(office.brandBackgrounds);
  });
  const router = useRouter();
  // Quem tem mesa fixa começa sentado nela.
  const [startAt] = useState(() => {
    const mine = desks.find((d) => d.userId === me.id);
    const seat = mine ? DESK_SEATS[mine.index] : null;
    return seat ? { x: seat.x, y: seat.y } : { x: SPAWN.x, y: SPAWN.y };
  });
  const [bridge] = useState(() => new GameBridge({ id: me.id, name: me.name, avatar: me.avatar, x: startAt.x, y: startAt.y }));
  const [status, setStatusState] = useState<StatusKey>("disponivel");
  const [hand, setHand] = useState(false);
  const [ring, setRing] = useState<RingMsg | null>(null);
  const [knocks, setKnocks] = useState<KnockMsg[]>([]);
  const [knockBusy, setKnockBusy] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [tileReactions, setTileReactions] = useState<Map<string, { emoji: string; key: number }>>(new Map());
  const [deskPrompt, setDeskPrompt] = useState<number | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  /** O que estou segurando (café, suco...) ou jogando — aparece antes do nome. */
  const [held, setHeld] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<"fridge" | "coffee" | "vending" | null>(null);
  /** Mesa de jogo aberta (sinuca, totó, pingue-pongue, fliperama). */
  const [gameTable, setGameTable] = useState<GameTable | null>(null);
  const [gameBus] = useState<GameBus>(() => new Set());
  const gameHostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [gameReady, setGameReady] = useState(false);
  const [zoneKey, setZoneKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [chatThread, setChatThread] = useState<ThreadKey>("office");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  /** Janela flutuante (Picture-in-Picture de documento do Chrome) com a reunião. */
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [meetingMinimized, setMeetingMinimized] = useState(false);
  const [music, setMusic] = useState<MusicSnapshot | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const musicSeenRef = useRef(0);
  const onMusic = useCallback((e: MusicEvent) => {
    if (!e || typeof e.serverNow !== "number") return;
    // Ignora respostas antigas que chegam depois de um evento mais novo.
    if (e.serverNow < musicSeenRef.current) return;
    musicSeenRef.current = e.serverNow;
    setMusic({ ...e, skew: e.serverNow - Date.now() });
  }, []);
  /** Busca o que está tocando na sala (ao entrar e quando o canal em tempo real fica pronto). */
  const loadMusic = useCallback(
    (rid: string) => {
      void fetch(`/api/music?officeId=${office.id}&roomId=${rid}`)
        .then((r) => (r.ok ? (r.json() as Promise<MusicEvent>) : null))
        .then((e) => {
          if (e && meetingIdRef.current === rid) onMusic(e);
        })
        .catch(() => {});
    },
    [office.id, onMusic],
  );
  // Caixas de som do corredor e da área de lazer (uma música por área).
  const [zoneMusic, setZoneMusic] = useState<Record<string, MusicSnapshot>>({});
  const zoneSeenRef = useRef<Record<string, number>>({});
  const onZoneMusic = useCallback((zone: string, e: MusicEvent) => {
    if (!e || typeof e.serverNow !== "number") return;
    if (e.serverNow < (zoneSeenRef.current[zone] ?? 0)) return;
    zoneSeenRef.current[zone] = e.serverNow;
    setZoneMusic((m) => ({ ...m, [zone]: { ...e, skew: e.serverNow - Date.now() } }));
  }, []);
  const [nearIds, setNearIds] = useState<string[]>([]);
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const { toasts, push: toast, dismiss } = useToasts();
  const chat = useChat(office.id, me.id);

  const roomsByZone = useMemo(() => new Map(rooms.map((r) => [r.zoneKey, r])), [rooms]);
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // ---------------------------------------------------------------------------
  // Agenda das salas
  // ---------------------------------------------------------------------------
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  /** Relógio da agenda (atualiza a cada 20 s). */
  const [clock, setClock] = useState(() => Date.now());
  const [reminder, setReminder] = useState<Booking | null>(null);
  const remindedRef = useRef<Set<string>>(new Set());
  const loadBookings = useCallback(() => {
    void fetch(`/api/bookings?officeId=${office.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ bookings: Booking[]; members: { id: string; name: string }[] }>) : null))
      .then((j) => {
        if (!j) return;
        setBookings(j.bookings);
        setMembers(j.members);
      })
      .catch(() => {});
  }, [office.id]);
  useEffect(() => {
    loadBookings();
    const tick = window.setInterval(() => setClock(Date.now()), 20_000);
    const refresh = window.setInterval(loadBookings, 5 * 60_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, [loadBookings]);

  // ---------------------------------------------------------------------------
  // Tempo real (Ably)
  // ---------------------------------------------------------------------------
  const mediaResetRef = useRef<((roomIds: (string | null)[]) => void) | null>(null);
  const onControl = useCallback(
    (msg: ControlMsg) => {
      if (msg?.type === "rooms-updated" || msg?.type === "office-updated") router.refresh();
      if (msg?.type === "bookings-updated") loadBookings();
      if (msg?.type === "media-reset") mediaResetRef.current?.(msg.roomIds);
    },
    [router, loadBookings],
  );


  const [initialPresence] = useState(() => ({
    name: me.name,
    avatar: me.avatar,
    x: Math.round(startAt.x),
    y: Math.round(startAt.y),
    dir: "down" as const,
    zone: null,
    roomId: null,
    mic: initialSettings.mic_on_join,
    cam: initialSettings.cam_on_join,
    screen: false,
    tab: "",
    status: "disponivel",
    hand: false,
  }));

  // Status salvo neste navegador (lido depois da montagem para não divergir do HTML do servidor).
  useEffect(() => {
    const t = window.setTimeout(() => setStatusState(loadStatus()), 0);
    return () => window.clearTimeout(t);
  }, []);
  const changeStatus = useCallback((s: StatusKey) => {
    setStatusState(s);
    saveStatus(s);
  }, []);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Reações: emoji sobre o personagem no mapa e sobre o vídeo na reunião.
  const onReaction = useCallback(
    (fromId: string, msg: ReactionMsg) => {
      bridge.pushReaction(fromId, msg.e);
      if (msg.roomId && msg.roomId === meetingIdRef.current) {
        const key = Date.now() + Math.random();
        setTileReactions((prev) => new Map(prev).set(fromId, { emoji: msg.e, key }));
        window.setTimeout(() => {
          setTileReactions((prev) => {
            if (prev.get(fromId)?.key !== key) return prev;
            const next = new Map(prev);
            next.delete(fromId);
            return next;
          });
        }, 2500);
      }
    },
    [bridge],
  );

  // Chamado: som (exceto em "Não perturbe") + cartão com "Ir".
  const onRing = useCallback((msg: RingMsg) => {
    if (statusRef.current !== "nao-perturbe") playChime("ring");
    setRing(msg);
  }, []);
  useEffect(() => {
    if (!ring) return;
    const t = window.setTimeout(() => setRing(null), 25_000);
    return () => window.clearTimeout(t);
  }, [ring]);

  // Batidas na porta (para quem está dentro da sala).
  const onKnock = useCallback(
    (msg: KnockMsg) => {
      if (!msg?.fromId || msg.fromId === me.id) return;
      playChime("knock");
      setKnocks((prev) => (prev.some((k) => k.fromId === msg.fromId) ? prev : [...prev, msg]));
    },
    [me.id],
  );
  const onKnockResolved = useCallback((fromId: string) => {
    setKnocks((prev) => prev.filter((k) => k.fromId !== fromId));
  }, []);
  const knockAnswerRef = useRef<((m: KnockAnswerMsg) => void) | null>(null);
  const onKnockAnswer = useCallback((m: KnockAnswerMsg) => knockAnswerRef.current?.(m), []);

  // Aviso (som + notificação) quando alguém chega na sede.
  const onPeerJoin = useCallback(
    (_id: string, name: string) => {
      playChime("office");
      toast(`${name} entrou na ${office.name}`, "join");
    },
    [office.name, toast],
  );

  const rt = useOfficeRealtime({
    officeId: office.id,
    myId: me.id,
    maxOnline: office.maxOnline,
    bridge,
    initialPresence,
    onChat: chat.receive,
    onControl,
    onPeerJoin,
    onMusic,
    onZoneMusic,
    onRoomReady: loadMusic,
    onReaction,
    onRing,
    onKnock,
    onKnockResolved,
    onKnockAnswer,
    onPunch: (from, to) => onPunchRef.current?.(from, to),
    onJump: (from) => bridge.pushJump(from),
    onGame: (from, msg) => {
      for (const h of gameBus) h(from, msg);
    },
    onBoard: (from, msg) => onBoardRef.current?.(from, msg),
  });
  const { reportMove, updatePresence, setRoomChannel, sendReaction, sendPunch, sendJump, sendGame, sendBoard } = rt;

  // Pulo (barra de espaço) aparece para todos.
  useEffect(() => {
    bridge.setHandlers({ onLocalJump: sendJump });
    return () => bridge.setHandlers({ onLocalJump: null });
  }, [bridge, sendJump]);

  // Com um jogo aberto, o teclado é do jogo (o personagem não anda nem pula).
  useEffect(() => {
    if (!gameTable) return;
    bridge.setInputEnabled(false);
    return () => bridge.setInputEnabled(true);
  }, [bridge, gameTable]);

  // ---------------------------------------------------------------------------
  // Mídia (LiveKit)
  // ---------------------------------------------------------------------------
  const onSpeakers = useCallback(
    (ids: Set<string>) => {
      bridge.setSpeaking(ids);
      setSpeakers(ids);
    },
    [bridge],
  );
  // O serviço não muda enquanto o componente existe (a chave do componente inclui o serviço).
  const useMediaHook = office.mediaProvider === "cloudflare" ? useCfMedia : useMedia;
  const media = useMediaHook({
    officeId: office.id,
    myId: me.id,
    myName: me.name,
    roster: rt.roster,
    publishRtc: (rtc: RtcInfo | null) => updatePresence({ rtc }),
    prefs: {
      audioInputId: settings.audio_input_id,
      videoInputId: settings.video_input_id,
      audioOutputId: settings.audio_output_id,
      masterVolume: settings.master_volume,
    },
    initialMic: initialSettings.mic_on_join,
    initialCam: initialSettings.cam_on_join,
    onSpeakers,
    onError: (m) => toast(m, "error"),
  });
  const { setProximity, joinMeeting: mediaJoin, leaveMeeting: mediaLeave, applyVolumes, switchDevice, resetSession } = media;
  // Um administrador tirou alguém da sala: quem está nela recomeça a sessão (passes novos).
  useEffect(() => {
    mediaResetRef.current = (roomIds) => {
      if (roomIds.includes(meetingId)) resetSession();
    };
  }, [meetingId, resetSession]);

  // ---------------------------------------------------------------------------
  // Jogo (Phaser) — carregado só no navegador
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const host = gameHostRef.current;
    if (!host) return;
    bridge.setProximityRadius(office.proximityRadius);
    bridge.setShowNames(initialSettings.show_names);
    // Celular: começa mais afastado para enxergar mais do escritório.
    const initialZoom = window.innerWidth >= 1800 ? 1.5 : window.innerWidth < 640 ? 0.75 : 1;
    bridge.setZoom(initialZoom);
    bridge.setHandlers({
      onReady: () => {
        setGameReady(true);
        setZoom(initialZoom);
      },
      onPinchZoom: (z) => setZoom(z),
    });
    void import("@/lib/game/createGame").then(({ createGame }) => {
      if (cancelled) return;
      gameRef.current = createGame(host, bridge);
    });
    return () => {
      cancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [bridge, office.proximityRadius, initialSettings.show_names]);

  // Eventos da cena -> rede/UI
  useEffect(() => {
    bridge.setHandlers({
      onLocalMove: (s) => reportMove(s.x, s.y, s.dir, s.moving),
      onZoneChange: (key) => setZoneKey(key),
    });
    return () => bridge.setHandlers({ onLocalMove: null, onZoneChange: null });
  }, [bridge, reportMove]);

  // Estado local -> presença
  useEffect(() => {
    bridge.setLocalMic(media.mic);
    bridge.setLocalBadge(badgeOf({ status, hand }));
    bridge.setLocalItem(held);
    updatePresence({
      mic: media.mic,
      cam: media.cam,
      screen: media.screen,
      roomId: meetingId,
      zone: zoneKey,
      status,
      hand,
      item: held,
      game: gameTable?.key ?? null,
    });
  }, [bridge, media.mic, media.cam, media.screen, meetingId, zoneKey, status, hand, held, gameTable, updatePresence]);

  // O item na mão some depois de 3 minutos.
  useEffect(() => {
    if (!held) return;
    const t = window.setTimeout(() => setHeld(null), 180_000);
    return () => window.clearTimeout(t);
  }, [held]);

  const holdItem = useCallback(
    (t: Treat, verb = "Você pegou") => {
      setHeld(t.emoji);
      sendReaction(t.emoji);
      toast(`${verb}: ${t.label} ${t.emoji}`, "success");
    },
    [sendReaction, toast],
  );

  // A mão abaixa sozinha ao sair da reunião.
  useEffect(() => {
    if (meetingId) return;
    const t = window.setTimeout(() => setHand(false), 0);
    return () => window.clearTimeout(t);
  }, [meetingId]);

  // Placas com o nome e banners com a logo das salas.
  useEffect(() => {
    bridge.setRoomDecor(
      rooms.map((r) => ({ zoneKey: r.zoneKey, name: r.name, theme: r.theme, logoUrl: r.logoUrl })),
      office.logoUrl,
    );
  }, [bridge, rooms, office.logoUrl]);

  // Nomes nas mesas fixas.
  useEffect(() => {
    const names: string[] = [];
    for (const d of desks) names[d.index] = d.name;
    bridge.setDeskNames(names);
  }, [bridge, desks]);

  // ---------------------------------------------------------------------------
  // Proximidade: calcula a cada 200ms e aplica assinaturas/volume no LiveKit
  // ---------------------------------------------------------------------------
  const rosterRef = useRef(rt.roster);
  useEffect(() => {
    rosterRef.current = rt.roster;
  }, [rt.roster]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const rosterData = new Map(rosterRef.current.map((r) => [r.id, r.data]));
      const peers = Array.from(bridge.remotes.values()).map((r) => ({
        id: r.id,
        x: r.tx,
        y: r.ty,
        roomId: rosterData.get(r.id)?.roomId ?? null,
        dnd: rosterData.get(r.id)?.status === "nao-perturbe",
      }));
      const results = computeProximity(
        { x: bridge.local.x, y: bridge.local.y, roomId: meetingId, dnd: statusRef.current === "nao-perturbe" },
        peers,
        office.proximityRadius,
        office.proximityMode,
      );
      const near: string[] = [];
      for (const res of results) {
        bridge.setRemoteNear(res.id, res.connected);
        if (res.connected) near.push(res.id);
      }
      if (!meetingId) setProximity(results);
      setNearIds((prev) => (prev.length === near.length && prev.every((id, i) => id === near[i]) ? prev : near));
    }, 200);
    return () => window.clearInterval(t);
  }, [bridge, meetingId, office.proximityRadius, office.proximityMode, setProximity]);

  // ---------------------------------------------------------------------------
  // Salas de reunião
  // ---------------------------------------------------------------------------
  const zone = zoneKey ? zoneByKey(zoneKey) ?? null : null;
  const zoneRoom = zone?.kind === "meeting" ? roomsByZone.get(zone.key) ?? null : null;
  const meetingRoom = meetingId ? roomsById.get(meetingId) ?? null : null;

  const occupancy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rt.roster) if (r.data.roomId) m.set(r.data.roomId, (m.get(r.data.roomId) ?? 0) + 1);
    if (meetingId) m.set(meetingId, (m.get(meetingId) ?? 0) + 1);
    return m;
  }, [rt.roster, meetingId]);

  /** Volta para o corredor, do lado de fora da porta da sala. */
  const stepOutside = useCallback(
    (zoneKeyOfRoom: string) => {
      bridge.setLocked(false);
      const door = zoneByKey(zoneKeyOfRoom)?.door;
      if (door) bridge.teleport(door.x * TILE, door.y * TILE + 8, "down");
    },
    [bridge],
  );

  /**
   * Senta numa cadeira da sala e entra na chamada dela.
   * Também serve para trocar de sala quando já se está numa reunião.
   * Enquanto estiver na reunião, o personagem fica preso no lugar.
   */
  /** Bater na porta de uma sala trancada. */
  const knockRef = useRef<string | null>(null);
  const knock = useCallback(
    async (room: RoomInfo) => {
      const r = await fetch("/api/rooms/knock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, roomId: room.id, action: "knock" }),
      }).catch(() => null);
      if (!r?.ok) {
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        toast(j?.error ?? "Não foi possível bater na porta.", "error");
        return;
      }
      knockRef.current = room.id;
      playChime("knock");
      toast(`Você bateu na porta de ${room.name}. Aguarde alguém abrir…`, "info");
    },
    [office.id, toast],
  );

  const joinMeeting = useCallback(
    async (room: RoomInfo, seat?: Seat, ticket?: string) => {
      if (joining) return;
      if (!room.canAccess) {
        toast(`${room.name} é restrita: peça acesso a um administrador.`, "error");
        return;
      }
      // Trancada por alguém que ainda está dentro: precisa bater na porta.
      if (room.lockedBy && room.lockedBy !== me.id && !ticket && meetingId !== room.id) {
        const lockerInside = rosterRef.current.some((r) => r.id === room.lockedBy && r.data.roomId === room.id);
        if (lockerInside) {
          void knock(room);
          return;
        }
      }
      if (meetingId === room.id) {
        // Já está nesta sala: só troca de cadeira.
        if (seat) bridge.teleport(seat.x, seat.y, seat.dir);
        return;
      }
      if ((occupancy.get(room.id) ?? 0) >= room.capacity) {
        toast(`${room.name} está cheia (${room.capacity} pessoas).`, "error");
        return;
      }
      if (media.status === "unconfigured") {
        toast("Áudio e vídeo não estão configurados no servidor.", "error");
        return;
      }
      const occupied = Array.from(bridge.remotes.values()).map((r) => ({ x: r.tx, y: r.ty }));
      const target = seat ?? freeSeat(room.zoneKey, occupied);
      const previous = meetingId ? roomsById.get(meetingId) ?? null : null;

      setJoining(true);
      bridge.setLocked(true);
      if (target) bridge.teleport(target.x, target.y, target.dir);
      const ok = await mediaJoin(room.id, ticket);
      if (ok) {
        setKnocks([]);
        if (!previous) setMeetingMinimized(false);
        setMeetingId(room.id);
        void setRoomChannel(room.id);
        setChatThread(`room:${room.id}`);
        toast(previous ? `Você foi para ${room.name}` : `Você entrou em ${room.name}`, "success");
      } else {
        // Não entrou (sala cheia, sem acesso, erro): volta para fora e reconecta a proximidade.
        setMeetingId(null);
        void setRoomChannel(null);
        setChatThread((t) => (t.startsWith("room:") ? "office" : t));
        stepOutside(room.zoneKey);
        await mediaLeave();
      }
      setJoining(false);
    },
    [joining, meetingId, occupancy, media.status, bridge, roomsById, mediaJoin, mediaLeave, setRoomChannel, stepOutside, toast, me.id, knock],
  );

  // Resposta à batida: entra com o passe ou avisa que não abriram.
  useEffect(() => {
    knockAnswerRef.current = (m) => {
      if (!m || m.roomId !== knockRef.current) return;
      knockRef.current = null;
      const room = roomsById.get(m.roomId);
      if (!room) return;
      if (m.accepted && m.ticket) {
        toast(`${m.byName} abriu a porta de ${room.name}`, "success");
        void joinMeeting(room, undefined, m.ticket);
      } else {
        toast(`${m.byName} não abriu a porta de ${room.name}.`, "info");
      }
    };
  }, [roomsById, joinMeeting, toast]);

  const answerKnock = useCallback(
    async (k: KnockMsg, accept: boolean) => {
      setKnockBusy(true);
      const r = await fetch("/api/rooms/knock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, roomId: k.roomId, action: "answer", toUserId: k.fromId, accept }),
      }).catch(() => null);
      setKnockBusy(false);
      setKnocks((prev) => prev.filter((x) => x.fromId !== k.fromId));
      if (!r?.ok) toast("Não foi possível responder.", "error");
    },
    [office.id, toast],
  );

  const setRoomLock = useCallback(
    async (roomId: string, locked: boolean) => {
      setLockBusy(true);
      const r = await fetch("/api/rooms/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, roomId, locked }),
      }).catch(() => null);
      setLockBusy(false);
      if (!r?.ok) {
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        toast(j?.error ?? "Não foi possível trancar a sala.", "error");
        return false;
      }
      router.refresh();
      toast(locked ? "Sala trancada: quem chegar precisa bater na porta." : "Sala destrancada.", "info");
      return true;
    },
    [office.id, router, toast],
  );

  const leaveMeeting = useCallback(async () => {
    if (!meetingId) return;
    const room = roomsById.get(meetingId);
    // Quem trancou destranca ao sair.
    if (room?.lockedBy === me.id) await setRoomLock(room.id, false);
    setMeetingId(null);
    void setRoomChannel(null);
    setChatThread((t) => (t.startsWith("room:") ? "office" : t));
    if (room) stepOutside(room.zoneKey);
    else bridge.setLocked(false);
    await mediaLeave();
    if (room) toast(`Você saiu de ${room.name}`, "info");
  }, [meetingId, mediaLeave, setRoomChannel, roomsById, stepOutside, bridge, toast, me.id, setRoomLock]);

  // ---------------------------------------------------------------------------
  // Janela flutuante: rostos e transmissão por cima de outras abas/programas
  // ---------------------------------------------------------------------------
  const pipRef = useRef<Window | null>(null);
  const openPip = useCallback(async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } })
      .documentPictureInPicture;
    if (!dpip) {
      toast("A janela flutuante funciona no Chrome ou no Edge (computador).", "error");
      return;
    }
    if (pipRef.current) return;
    try {
      const w = await dpip.requestWindow({ width: 420, height: 340 });
      // Leva os estilos e as fontes da página para a janela flutuante.
      for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
        if (node instanceof HTMLLinkElement) {
          const l = w.document.createElement("link");
          l.rel = "stylesheet";
          l.href = node.href;
          w.document.head.appendChild(l);
        } else {
          w.document.head.appendChild(node.cloneNode(true));
        }
      }
      w.document.documentElement.className = document.documentElement.className;
      if (document.documentElement.dataset.fundoImagem) w.document.documentElement.dataset.fundoImagem = "1";
      w.document.body.className = document.body.className;
      w.document.title = "Reunião · Frédy";
      w.addEventListener("pagehide", () => {
        pipRef.current = null;
        setPipWindow(null);
      });
      pipRef.current = w;
      setPipWindow(w);
    } catch {
      toast("Não foi possível abrir a janela flutuante.", "error");
    }
  }, [toast]);

  const togglePip = useCallback(() => {
    if (pipRef.current) pipRef.current.close();
    else void openPip();
  }, [openPip]);

  // Fecha a janela flutuante ao sair da reunião.
  useEffect(() => {
    if (!meetingId) pipRef.current?.close();
  }, [meetingId]);

  // Ao trocar de aba durante a reunião, o Chrome pode abrir a janela sozinho
  // (Picture-in-Picture automático para videochamadas).
  useEffect(() => {
    if (!meetingId || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => void openPip());
    } catch {
      return;
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        /* sem suporte */
      }
    };
  }, [meetingId, openPip]);

  // Caixa de som: carrega o que está tocando ao entrar numa sala; para ao sair.
  useEffect(() => {
    meetingIdRef.current = meetingId;
    musicSeenRef.current = 0;
    if (!meetingId) return;
    loadMusic(meetingId);
    return () => setMusic(null);
  }, [meetingId, loadMusic]);

  // ---------------------------------------------------------------------------
  // Quadro branco da reunião (traços pelo canal do escritório, marcados com a sala)
  // ---------------------------------------------------------------------------
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  const onBoardRef = useRef<((from: string, msg: BoardMsg) => void) | null>(null);
  useEffect(() => {
    onBoardRef.current = (from, msg) => {
      const room = meetingIdRef.current;
      if (!room || !msg || msg.room !== room) return;
      if (msg.k === "req") {
        // Quem chegou pede uma cópia; só uma pessoa da sala responde.
        const st = boardRef.current;
        const inRoom = [me.id, ...rosterRef.current.filter((r) => r.data.roomId === room).map((r) => r.id)];
        if ((st.open || st.strokes.length) && isSyncResponder(me.id, from, inRoom)) {
          const chunks = chunkStrokes(st.strokes);
          if (!chunks.length) chunks.push([]);
          for (const c of chunks) sendBoard({ k: "sync", room, to: from, open: st.open, strokes: c });
        }
        return;
      }
      if (msg.k === "open" && !boardRef.current.open) {
        const name = rosterRef.current.find((r) => r.id === from)?.data.name ?? "Alguém";
        toast(`${name} abriu o quadro branco`, "info");
      }
      setBoard((s) => applyBoard(s, from, msg, me.id));
    };
  }, [me.id, sendBoard, toast]);

  // Ao entrar numa sala, pede o quadro a quem já está lá; ao sair, esquece.
  useEffect(() => {
    if (!meetingId) return;
    sendBoard({ k: "req", room: meetingId });
    return () => setBoard(EMPTY_BOARD);
  }, [meetingId, sendBoard]);

  const boardSend = useCallback(
    (m: BoardMsg) => {
      setBoard((s) => applyBoard(s, me.id, m, me.id));
      sendBoard(m);
    },
    [me.id, sendBoard],
  );
  const boardActions = useMemo(() => {
    const room = meetingId ?? "";
    return {
      open: () => boardSend({ k: "open", room }),
      close: () => boardSend({ k: "close", room }),
      stroke: (s: Stroke) => boardSend({ k: "stroke", room, s }),
      clear: () => boardSend({ k: "clear", room }),
      undo: () => {
        const mine = boardRef.current.strokes.filter((s) => s.by === me.id);
        const last = mine[mine.length - 1];
        if (last) boardSend({ k: "undo", room, id: last.id });
      },
    };
  }, [meetingId, boardSend, me.id]);

  // Área com caixa de som (fora das reuniões): busca o que está tocando ao entrar.
  const musicZone = !meetingId && isMusicZone(zoneKey) ? zoneKey : null;
  useEffect(() => {
    if (!musicZone) return;
    void fetch(`/api/music?officeId=${office.id}&zone=${musicZone}`)
      .then((r) => (r.ok ? (r.json() as Promise<MusicEvent>) : null))
      .then((e) => {
        if (e) onZoneMusic(musicZone, e);
      })
      .catch(() => {});
  }, [musicZone, office.id, onZoneMusic]);

  // Aviso (som + notificação) quando alguém entra na sala em que estou.
  const roomSeenRef = useRef<{ room: string | null; ids: Set<string> }>({ room: null, ids: new Set() });
  useEffect(() => {
    const here = rt.roster.filter((r) => meetingId && r.data.roomId === meetingId);
    const prev = roomSeenRef.current;
    if (meetingId && prev.room === meetingId) {
      const roomName = roomsById.get(meetingId)?.name ?? "sala";
      for (const r of here) {
        if (!prev.ids.has(r.id)) {
          playChime("room");
          toast(`${r.data.name} entrou na ${roomName}`, "join");
        }
      }
    }
    roomSeenRef.current = { room: meetingId, ids: new Set(here.map((r) => r.id)) };
  }, [rt.roster, meetingId, roomsById, toast]);

  // Clique numa cadeira de sala de reunião -> senta e entra.
  useEffect(() => {
    bridge.setHandlers({
      onSeatClick: (seat) => {
        const room = roomsByZone.get(seat.zoneKey);
        if (!room) {
          toast("Esta sala não está disponível neste escritório.", "error");
          return;
        }
        void joinMeeting(room, seat);
      },
    });
    bridge.setHandlers({
      onItemClick: (it) => {
        if (meetingIdRef.current) {
          toast("Saia da reunião para usar isso.", "info");
          return;
        }
        bridge.teleport(it.x, it.y, it.dir);
        if (it.kind === "fridge" || it.kind === "coffee" || it.kind === "vending") setItemDialog(it.kind);
        else if (it.kind === "water") holdItem({ emoji: "💧", label: "Água" });
        else if (it.kind === "game" && it.emoji) {
          holdItem({ emoji: it.emoji, label: it.label }, "Jogando");
          if (it.type === "pingPong" || it.type === "foosball" || it.type === "poolTable" || it.type === "arcade") {
            setGameTable({ key: `${it.type}-${INTERACTIONS.indexOf(it)}`, type: it.type, label: it.label });
          }
        }
      },
      onDeskClick: (d) => {
        if (meetingIdRef.current) {
          toast("Saia da reunião para ir até uma mesa.", "info");
          return;
        }
        bridge.teleport(d.x, d.y, d.dir);
        setDeskPrompt(d.index);
      },
    });
    return () => bridge.setHandlers({ onSeatClick: null, onDeskClick: null, onItemClick: null });
  }, [bridge, roomsByZone, joinMeeting, toast, holdItem]);

  // Atalho "E" para entrar na sala.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (e.key.toLowerCase() === "e" && zoneRoom && !meetingId && zoneRoom.canAccess) {
        e.preventDefault();
        void joinMeeting(zoneRoom);
      }
      if (e.key === "Escape") setPanel("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoneRoom, meetingId, joinMeeting]);

  // ---------------------------------------------------------------------------
  // Participantes (painel lateral)
  // ---------------------------------------------------------------------------
  const participantRows: ParticipantRow[] = useMemo(() => {
    const locate = (roomId: string | null, zk: string | null) => {
      if (roomId) return { label: roomsById.get(roomId)?.name ?? "Reunião", inMeeting: true };
      return { label: (zk && zoneByKey(zk)?.label) || "Escritório", inMeeting: false };
    };
    const rows: ParticipantRow[] = [
      {
        id: me.id,
        name: me.name,
        avatar: bridge.local.avatar,
        isMe: true,
        mic: media.mic,
        cam: media.cam,
        screen: media.screen,
        speaking: speakers.has(me.id),
        near: false,
        ...locate(meetingId, zoneKey),
        statusEmoji: statusInfo(status).emoji,
        statusLabel: statusInfo(status).label,
        hand,
      },
    ];
    for (const r of rt.roster) {
      const remote = bridge.remotes.get(r.id);
      rows.push({
        id: r.id,
        name: r.data.name,
        avatar: remote?.avatar ?? me.avatar,
        isMe: false,
        mic: Boolean(r.data.mic),
        cam: Boolean(r.data.cam),
        screen: Boolean(r.data.screen),
        speaking: speakers.has(r.id),
        near: nearIds.includes(r.id),
        ...locate(r.data.roomId, r.data.zone),
        statusEmoji: statusInfo(r.data.status).emoji,
        statusLabel: statusInfo(r.data.status).label,
        hand: Boolean(r.data.hand),
      });
    }
    return rows;
  }, [rt.roster, me, bridge, media.mic, media.cam, media.screen, speakers, nearIds, meetingId, zoneKey, roomsById, status, hand]);

  const openDm = useCallback((peerId: string) => {
    setChatThread(`dm:${peerId}`);
    setPanel("chat");
  }, []);

  const goTo = useCallback(
    (peerId: string) => {
      const r = bridge.remotes.get(peerId);
      if (!r) return;
      bridge.teleport(r.tx + 28, r.ty + 6);
    },
    [bridge],
  );

  // ---------------------------------------------------------------------------
  // Soco de brincadeira 👊 (tecla F ou menu de reações): acerta quem estiver mais perto.
  // ---------------------------------------------------------------------------
  const lastPunchRef = useRef(0);
  const punchNearest = useCallback(() => {
    if (meetingId) {
      toast("Sem socos na reunião 😅", "info");
      return;
    }
    const now = performance.now();
    if (now - lastPunchRef.current < 1000) return;
    const inMeetingIds = new Set(rt.roster.filter((r) => r.data.roomId).map((r) => r.id));
    let best: { id: string; d: number } | null = null;
    for (const r of bridge.remotes.values()) {
      if (inMeetingIds.has(r.id)) continue;
      const d = Math.hypot(r.tx - bridge.local.x, r.ty - bridge.local.y);
      if (d <= 64 && (!best || d < best.d)) best = { id: r.id, d };
    }
    if (!best) {
      toast("Chegue pertinho de alguém para dar um soco 👊", "info");
      return;
    }
    lastPunchRef.current = now;
    sendPunch(best.id);
  }, [meetingId, rt.roster, bridge, sendPunch, toast]);

  const onPunchRef = useRef<((from: string, to: string) => void) | null>(null);
  useEffect(() => {
    onPunchRef.current = (from, to) => {
      bridge.pushPunch(from, to);
      if (to === me.id && from !== me.id) {
        const name = rt.roster.find((r) => r.id === from)?.data.name ?? "Alguém";
        toast(`${name} te deu um soco! 👊`, "info");
      }
    };
  }, [bridge, me.id, rt.roster, toast]);

  // Tecla F = soco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (gameTable || itemDialog) return;
      if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) punchNearest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [punchNearest, gameTable, itemDialog]);

  // Mãos levantadas na reunião atual (a minha + as da presença).
  const meetingHands = useMemo(() => {
    const s = new Set<string>();
    if (!meetingId) return s;
    if (hand) s.add(me.id);
    for (const r of rt.roster) if (r.data.roomId === meetingId && r.data.hand) s.add(r.id);
    return s;
  }, [meetingId, hand, me.id, rt.roster]);

  /** Chamar alguém (toca um aviso para a pessoa). */
  const sendRing = useCallback(
    async (peerId: string) => {
      const where = meetingRoom ? `Na ${meetingRoom.name}` : zone?.label ? `Em ${zone.label}` : "No escritório";
      const r = await fetch("/api/ring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, toUserId: peerId, where, roomId: meetingId }),
      }).catch(() => null);
      const j = (await r?.json().catch(() => ({}))) as { error?: string; status?: string } | undefined;
      const name = rt.roster.find((x) => x.id === peerId)?.data.name ?? "a pessoa";
      if (!r?.ok) {
        toast(j?.error ?? "Não foi possível chamar.", "error");
        return;
      }
      if (j?.status === "nao-perturbe") toast(`${name} está em “Não perturbe”: o aviso chegou sem som.`, "info");
      else toast(`Chamando ${name}…`, "success");
    },
    [meetingRoom, zone, office.id, meetingId, rt.roster, toast],
  );

  /** "Ir" no aviso de chamado: entra na sala de quem chamou ou vai até a pessoa. */
  const goToRing = useCallback(
    async (r: RingMsg) => {
      const room = r.roomId ? roomsById.get(r.roomId) : null;
      if (room) {
        await joinMeeting(room);
        return;
      }
      if (meetingId) await leaveMeeting();
      window.setTimeout(() => goTo(r.fromId), meetingId ? 400 : 0);
    },
    [roomsById, joinMeeting, meetingId, leaveMeeting, goTo],
  );

  // ---------------------------------------------------------------------------
  // Agenda: lembrete 5 min antes, reservar, cancelar
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const due = dueReminders(bookings, me.id, clock, remindedRef.current);
    if (!due.length) return;
    const t = window.setTimeout(() => {
      for (const b of due) remindedRef.current.add(b.id);
      const b = due[0];
      if (meetingIdRef.current === b.roomId) return;
      if (statusRef.current !== "nao-perturbe") playChime("ring");
      setReminder(b);
    }, 0);
    return () => window.clearTimeout(t);
  }, [bookings, clock, me.id]);
  useEffect(() => {
    if (!reminder) return;
    const t = window.setTimeout(() => setReminder(null), 120_000);
    return () => window.clearTimeout(t);
  }, [reminder]);

  const createBooking = useCallback(
    async (b: NewBooking) => {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, ...b }),
      }).catch(() => null);
      if (!r?.ok) {
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        return j?.error ?? "Não foi possível reservar a sala.";
      }
      toast(
        b.attendees.length ? "Sala reservada! Os convidados recebem um aviso 5 min antes." : "Sala reservada!",
        "success",
      );
      loadBookings();
      return null;
    },
    [office.id, toast, loadBookings],
  );
  const cancelBooking = useCallback(
    async (id: string) => {
      const r = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, id }),
      }).catch(() => null);
      if (!r?.ok) {
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        toast(j?.error ?? "Não foi possível cancelar.", "error");
        return;
      }
      toast("Reserva cancelada.", "info");
      loadBookings();
    },
    [office.id, toast, loadBookings],
  );

  /** Texto curto sobre a reserva da sala (agora ou nas próximas 3 horas). */
  const bookingNote = useCallback(
    (roomId: string) => {
      const { current, next } = roomSchedule(bookings, roomId, clock);
      if (current) return `Reservada: “${current.title}” até ${fmtTime(current.endsAt)}`;
      if (next && new Date(next.startsAt).getTime() - clock < 3 * 60 * 60_000)
        return `Reservada às ${fmtTime(next.startsAt)}: “${next.title}”`;
      return null;
    },
    [bookings, clock],
  );
  /** Minhas reuniões de hoje que ainda não acabaram (número no botão da agenda). */
  const myTodayCount = useMemo(
    () =>
      bookings.filter((b) => isMine(b, me.id) && sameDay(b.startsAt, new Date(clock)) && new Date(b.endsAt).getTime() > clock)
        .length,
    [bookings, me.id, clock],
  );

  /** Define/libera a mesa fixa. */
  const setDesk = useCallback(
    async (desk: number | null) => {
      setDeskBusy(true);
      const r = await fetch("/api/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, desk }),
      }).catch(() => null);
      setDeskBusy(false);
      if (!r?.ok) {
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        toast(j?.error ?? "Não foi possível salvar a mesa.", "error");
        return;
      }
      setDeskPrompt(null);
      router.refresh();
      toast(desk === null ? "Mesa liberada." : "Pronto! Esta é a sua mesa: você começa aqui ao entrar.", "success");
    },
    [office.id, router, toast],
  );

  // ---------------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------------
  const saveSettings = useCallback(
    async (next: UserSettings) => {
      setSettings(next);
      bridge.setShowNames(next.show_names);
      gameRef.current?.refreshLabels();
      if (next.audio_input_id && next.audio_input_id !== settings.audio_input_id)
        await switchDevice("audioinput", next.audio_input_id);
      if (next.video_input_id && next.video_input_id !== settings.video_input_id)
        await switchDevice("videoinput", next.video_input_id);
      if (next.audio_output_id && next.audio_output_id !== settings.audio_output_id)
        await switchDevice("audiooutput", next.audio_output_id);
      const { error } = await supabaseBrowser()
        .from("user_settings")
        .upsert({
          user_id: me.id,
          mic_on_join: next.mic_on_join,
          cam_on_join: next.cam_on_join,
          audio_input_id: next.audio_input_id,
          video_input_id: next.video_input_id,
          audio_output_id: next.audio_output_id,
          master_volume: next.master_volume,
          show_names: next.show_names,
        });
      if (error) toast("Não foi possível salvar as configurações", "error");
      else toast("Configurações salvas", "success");
    },
    [bridge, switchDevice, me.id, settings, toast],
  );

  // O volume geral é aplicado depois que o novo valor chega ao hook de mídia.
  useEffect(() => {
    applyVolumes();
  }, [settings.master_volume, applyVolumes]);

  const changeZoom = useCallback((z: number) => {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(z * 4) / 4));
    setZoom(clamped);
    gameRef.current?.setZoom(clamped);
  }, []);

  const exitOffice = useCallback(() => router.push("/escritorio"), [router]);

  // Reunião em tela cheia cobre o mapa: ele passa a redesenhar só 4x/s, liberando processador
  // para o vídeo e a transmissão de tela.
  const meetingFull = Boolean(meetingId) && !meetingMinimized;
  useEffect(() => {
    if (!meetingFull || !gameReady) return;
    const t = window.setTimeout(() => gameRef.current?.setLowPower(true), 800);
    return () => {
      window.clearTimeout(t);
      gameRef.current?.setLowPower(false);
    };
  }, [meetingFull, gameReady]);

  const connectedCount = rt.roster.length + 1;
  const inMeeting = Boolean(meetingId);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div ref={gameHostRef} className="absolute inset-0" aria-label="Mapa do escritório" />
      {!gameReady && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--bg)]">
          <div className="flex flex-col items-center gap-3 text-sm text-[var(--muted)]">
            <span className="loader-pixel" aria-hidden />
            Montando o escritório…
          </div>
        </div>
      )}

      <TopBar
        officeName={office.name}
        officeLogo={office.logoUrl}
        online={connectedCount}
        realtimeState={rt.state}
        mediaStatus={media.status}
        zoneLabel={meetingRoom ? meetingRoom.name : zone?.label ?? null}
        zoom={zoom}
        onZoom={changeZoom}
        onRecenter={() => gameRef.current?.resetPan()}
        isManager={me.isManager}
        officeId={office.id}
        nearCount={inMeeting ? 0 : nearIds.length}
        status={status}
        onStatus={changeStatus}
        onAgenda={() => setAgendaOpen(true)}
        onInvite={office.inviteCode ? () => setInviteOpen(true) : null}
        agendaCount={myTodayCount}
      />

      {inMeeting && meetingRoom ? (
        <MeetingRoom
          room={meetingRoom}
          rooms={rooms}
          occupancy={occupancy}
          participants={media.participants}
          tiles={media.tiles}
          speakers={speakers}
          switching={joining}
          minimized={meetingMinimized}
          onMinimize={() => setMeetingMinimized(true)}
          onExpand={() => setMeetingMinimized(false)}
          pipOpen={Boolean(pipWindow)}
          onPip={togglePip}
          reactions={tileReactions}
          hands={meetingHands}
          locked={Boolean(meetingRoom.lockedBy)}
          lockBusy={lockBusy}
          onToggleLock={() => void setRoomLock(meetingRoom.id, !meetingRoom.lockedBy)}
          avatarFor={(id) => (id === me.id ? bridge.local.avatar : bridge.remotes.get(id)?.avatar ?? me.avatar)}
          onSwitch={(r) => void joinMeeting(r)}
          meId={me.id}
          board={board}
          onBoardOpen={boardActions.open}
          onBoardClose={boardActions.close}
          onBoardStroke={boardActions.stroke}
          onBoardUndo={boardActions.undo}
          onBoardClear={boardActions.clear}
          bookingLabel={bookingNote(meetingRoom.id)}
        />
      ) : (
        <ProximityStrip tiles={media.tiles} nearIds={nearIds} speakers={speakers} />
      )}

      {zoneRoom && !inMeeting && (
        <RoomPrompt
          room={zoneRoom}
          occupancy={occupancy.get(zoneRoom.id) ?? 0}
          joining={joining}
          mediaUnavailable={media.status === "unconfigured"}
          onJoin={() => joinMeeting(zoneRoom)}
          note={bookingNote(zoneRoom.id)}
        />
      )}

      {panel === "participants" && (
        <ParticipantsPanel
          rows={participantRows}
          onClose={() => setPanel("none")}
          onMessage={openDm}
          onGoTo={goTo}
          onRing={(id) => void sendRing(id)}
        />
      )}
      {panel === "chat" && (
        <ChatPanel
          myId={me.id}
          chat={chat}
          thread={chatThread}
          onThread={setChatThread}
          meetingRoom={meetingRoom}
          people={participantRows.filter((p) => !p.isMe)}
          onClose={() => setPanel("none")}
          onFocusChange={(f) => bridge.setInputEnabled(!f)}
        />
      )}

      <ControlBar
        mic={media.mic}
        cam={media.cam}
        screen={media.screen}
        mediaReady={media.status === "connected" || media.status === "standby"}
        mediaStatus={media.status}
        inMeeting={inMeeting}
        panel={panel}
        unread={chat.totalUnread}
        onMic={media.toggleMic}
        deafened={media.deafened}
        onDeafen={() => void media.toggleDeafen()}
        onCam={media.toggleCam}
        onScreen={media.toggleScreen}
        onSettings={() => setSettingsOpen(true)}
        onBackground={() => setBgOpen(true)}
        backgroundOn={media.background.mode !== "none"}
        hand={hand}
        onReact={sendReaction}
        onPunch={punchNearest}
        onHand={() => {
          if (!meetingId) {
            toast("A mão levantada é para usar dentro de uma reunião.", "info");
            return;
          }
          setHand((h) => !h);
        }}
        onParticipants={() => setPanel((p) => (p === "participants" ? "none" : "participants"))}
        onChat={() => setPanel((p) => (p === "chat" ? "none" : "chat"))}
        onLeave={inMeeting ? leaveMeeting : exitOffice}
        participantsCount={connectedCount}
      />

      {pipWindow &&
        inMeeting &&
        meetingRoom &&
        createPortal(
          <PipMeeting
            roomName={meetingRoom.name}
            capacity={meetingRoom.capacity}
            participants={media.participants}
            tiles={media.tiles}
            speakers={speakers}
            avatarFor={(id) => (id === me.id ? bridge.local.avatar : bridge.remotes.get(id)?.avatar ?? me.avatar)}
          />,
          pipWindow.document.body,
        )}

      {inMeeting && meetingRoom && (
        <RoomSpeaker
          key={meetingRoom.id}
          officeId={office.id}
          roomId={meetingRoom.id}
          roomName={meetingRoom.name}
          music={music}
          onError={(m) => toast(m, "error")}
          deafened={media.deafened}
        />
      )}

      {musicZone && (
        <RoomSpeaker
          key={`zona-${musicZone}`}
          officeId={office.id}
          zone={musicZone}
          placement="map"
          roomName={zoneByKey(musicZone)?.label ?? "Área"}
          music={zoneMusic[musicZone] ?? null}
          onError={(m) => toast(m, "error")}
          deafened={media.deafened}
        />
      )}

      <TouchJoystick bridge={bridge} />

      {bgOpen && (
        <BackgroundDialog
          effect={media.background}
          camOn={media.cam}
          localCam={media.tiles.find((t) => t.isLocal && t.source === "camera") ?? null}
          onChange={media.setBackground}
          onTurnOnCam={() => void media.toggleCam()}
          onClose={() => setBgOpen(false)}
          onError={(m) => toast(m, "error")}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (s) => {
            await saveSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}

      <StatusLayer
        realtimeState={rt.state}
        mediaStatus={media.status}
        mediaError={media.lastError}
        camOn={media.cam}
        audioBlocked={media.audioBlocked}
        onStartAudio={media.startAudio}
        onRetryMedia={media.retry}
        onReload={() => window.location.reload()}
      />
      {gameTable && (
        <GameDialog
          table={gameTable}
          me={{ id: me.id, name: me.name }}
          roster={rt.roster}
          bus={gameBus}
          send={sendGame}
          onClose={() => {
            setGameTable(null);
            setHeld(null);
          }}
        />
      )}
      {itemDialog && (
        <ItemDialog
          kind={itemDialog}
          onClose={() => setItemDialog(null)}
          onPick={(t) => {
            setItemDialog(null);
            holdItem(t);
          }}
        />
      )}
      {inviteOpen && office.inviteCode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-3 backdrop-blur-sm" onClick={() => setInviteOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Convidar para a sede"
            className="panel-in w-full max-w-lg rounded-2xl border border-white/10 bg-[#131c42] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-white">Convidar para {office.name}</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--muted)]">
              A sede é privada. Mande este link: a pessoa cria a conta (ou entra) e clica em “Aceitar convite”.
            </p>
            <InviteLink code={office.inviteCode} officeName={office.name} />
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setInviteOpen(false)} className="btn-ghost h-9 px-4 text-sm">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {agendaOpen && (
        <AgendaDialog
          rooms={rooms}
          bookings={bookings}
          members={members}
          meId={me.id}
          isManager={me.isManager}
          officeUrl={typeof window === "undefined" ? "" : `${window.location.origin}/escritorio/${office.slug}`}
          defaultRoomId={meetingId ?? zoneRoom?.id ?? null}
          now={clock}
          onCreate={createBooking}
          onCancel={cancelBooking}
          onJoin={(r) => {
            setAgendaOpen(false);
            void joinMeeting(r);
          }}
          onClose={() => setAgendaOpen(false)}
        />
      )}
      {reminder && !ring && (
        <BookingReminder
          title={
            new Date(reminder.startsAt).getTime() > clock
              ? `“${reminder.title}” começa às ${fmtTime(reminder.startsAt)}`
              : `“${reminder.title}” já começou`
          }
          detail={roomsById.get(reminder.roomId)?.name ?? "Sala de reunião"}
          onJoin={
            roomsById.get(reminder.roomId)
              ? () => {
                  const room = roomsById.get(reminder.roomId)!;
                  setReminder(null);
                  void joinMeeting(room);
                }
              : null
          }
          onDismiss={() => setReminder(null)}
        />
      )}
      {ring && (
        <RingPrompt
          ring={ring}
          onDismiss={() => setRing(null)}
          onGo={() => {
            const r = ring;
            setRing(null);
            void goToRing(r);
          }}
        />
      )}
      {inMeeting && <KnockRequests knocks={knocks} busy={knockBusy} onAnswer={(k, a) => void answerKnock(k, a)} />}
      {deskPrompt !== null && !inMeeting && (
        <DeskPrompt
          ownerName={desks.find((d) => d.index === deskPrompt && d.userId !== me.id)?.name ?? null}
          mine={desks.some((d) => d.index === deskPrompt && d.userId === me.id)}
          busy={deskBusy}
          onClose={() => setDeskPrompt(null)}
          onClaim={() => void setDesk(deskPrompt)}
          onRelease={() => void setDesk(null)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
