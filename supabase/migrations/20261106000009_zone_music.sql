-- =============================================================================
-- Migration 9: caixas de som fora das salas (corredor e área de lazer).
-- Uma música por área do mapa em cada sede. Lida e escrita só pelo servidor.
-- =============================================================================

create table if not exists public.zone_music (
  office_id  uuid not null references public.offices(id) on delete cascade,
  zone_key   text not null check (zone_key ~ '^[a-z0-9-]{2,40}$'),
  music      jsonb,
  updated_at timestamptz not null default now(),
  primary key (office_id, zone_key)
);

alter table public.zone_music enable row level security;
-- Sem políticas: só a chave do servidor (rota /api/music) acessa.
