"use client";

import { Mic, MicOff, MonitorUp, Users } from "lucide-react";
import { AvatarThumb } from "@/components/AvatarThumb";
import type { AvatarConfig } from "@/lib/avatar";
import type { MediaParticipant, VideoTile } from "@/lib/media/useMedia";
import { TrackVideo } from "./VideoTiles";

interface Props {
  roomName: string;
  capacity: number;
  participants: MediaParticipant[];
  tiles: VideoTile[];
  speakers: Set<string>;
  avatarFor: (id: string) => AvatarConfig;
}

/**
 * Conteúdo da janela flutuante (Picture-in-Picture do Chrome):
 * tela compartilhada em cima (se houver) e os rostos embaixo, em grade.
 */
export function PipMeeting({ roomName, capacity, participants, tiles, speakers, avatarFor }: Props) {
  const screen = tiles.find((t) => t.source === "screen") ?? null;
  const camOf = (id: string) => tiles.find((t) => t.identity === id && t.source === "camera");
  const n = participants.length;
  const cols = screen ? Math.min(n, 4) || 1 : n <= 1 ? 1 : n <= 4 ? 2 : 3;

  return (
    <div className="flex h-screen flex-col gap-2 bg-[var(--bg)] p-2 text-white">
      <header className="flex shrink-0 items-center gap-2 px-1 text-xs">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--coral)]" />
        <span className="truncate font-semibold">{roomName}</span>
        <span className="flex shrink-0 items-center gap-1 text-[var(--muted)]">
          <Users size={11} /> {n}/{capacity}
        </span>
      </header>
      {screen && (
        <div className="relative min-h-0 flex-[3] overflow-hidden rounded-lg bg-black">
          <TrackVideo tile={screen} className="h-full w-full object-contain" />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">
            <MonitorUp size={10} className="mr-1 inline" />
            Tela de {screen.isLocal ? "você" : screen.name}
          </span>
        </div>
      )}
      <div
        className={`grid min-h-0 gap-1.5 ${screen ? "flex-[1]" : "flex-1"}`}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {participants.map((p) => {
          const cam = camOf(p.identity);
          return (
            <figure
              key={p.identity}
              className={`relative min-h-0 overflow-hidden rounded-lg border-2 bg-[var(--panel-2)] ${speakers.has(p.identity) ? "border-[var(--amber)]" : "border-transparent"}`}
            >
              {cam ? (
                <TrackVideo tile={cam} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#1f2b5c,#0e1533)]">
                  <AvatarThumb avatar={avatarFor(p.identity)} scale={2} />
                </div>
              )}
              <figcaption className="absolute bottom-1 left-1 flex max-w-[90%] items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[10px]">
                {p.mic ? <Mic size={10} className="text-emerald-300" /> : <MicOff size={10} className="text-[#ff9b92]" />}
                <span className="truncate">{p.isLocal ? "Você" : p.name}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
