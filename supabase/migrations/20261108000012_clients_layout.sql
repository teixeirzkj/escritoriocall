-- =============================================================================
-- Migration 12: sedes de clientes.
-- - offices.layout: configuração do mapa gerado (null = mapa clássico).
-- - offices.logo_url: logo da empresa.  rooms.logo_url: logo do setor.
-- - offices.max_members: limite de usuários da sede (definido pela plataforma).
-- - rooms.theme aceita cor livre (#rrggbb) além das identidades prontas.
-- - bucket público "marcas" para as logos (envio só pelo servidor).
-- =============================================================================

alter table public.offices add column if not exists layout jsonb;
alter table public.offices add column if not exists logo_url text;
alter table public.offices add column if not exists max_members int
  check (max_members is null or max_members between 1 and 1000);

alter table public.rooms add column if not exists logo_url text;
alter table public.rooms drop constraint if exists rooms_theme_check;
alter table public.rooms add constraint rooms_theme_check
  check (theme is null or theme ~ '^(tete|fredy|duda|financeiro|#[0-9a-f]{6})$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
