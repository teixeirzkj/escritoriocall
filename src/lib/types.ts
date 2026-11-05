import type { AvatarConfig } from "./avatar";
import type { ProximityMode } from "./game/proximity";

export type AppRole = "user" | "admin";
export type OfficeRole = "member" | "moderator" | "owner";

export interface Profile {
  id: string;
  display_name: string;
  avatar_id: string | null;
  avatar_config: AvatarConfig | null;
  photo_url: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface AvatarPreset {
  id: string;
  name: string;
  description: string | null;
  preset: AvatarConfig;
  sort_order: number;
}

export interface Office {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  map_key: string;
  is_public: boolean;
  proximity_radius: number;
  proximity_mode: ProximityMode;
  max_online: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficeMember {
  office_id: string;
  user_id: string;
  role: OfficeRole;
  banned: boolean;
  joined_at: string;
}

export interface Room {
  id: string;
  office_id: string;
  zone_key: string;
  name: string;
  capacity: number;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  office_id: string;
  room_id: string | null;
  recipient_id: string | null;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: { display_name: string; avatar_config: AvatarConfig | null } | null;
}

export interface UserSettings {
  user_id: string;
  mic_on_join: boolean;
  cam_on_join: boolean;
  audio_input_id: string | null;
  video_input_id: string | null;
  audio_output_id: string | null;
  master_volume: number;
  show_names: boolean;
}

/** Sala como enviada ao cliente do escritório. */
export interface RoomInfo {
  id: string;
  zoneKey: string;
  name: string;
  capacity: number;
  isPrivate: boolean;
  /** O usuário atual tem acesso (pública, convidado ou gestor). */
  canAccess: boolean;
  /** Sala trancada por esta pessoa (id), ou null. */
  lockedBy: string | null;
}
