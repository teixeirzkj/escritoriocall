-- =============================================================================
-- Migration 13: limites dos planos (LiveKit e Ably) para os avisos de uso.
-- Valores iniciais = planos gratuitos. Editáveis em Admin → Uso e custos.
-- =============================================================================

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.platform_settings (key, value) values (
  'plan_limits',
  '{"livekit_minutes": 5000, "livekit_concurrent": 100, "ably_messages": 6000000, "ably_connections": 200, "ably_channels": 200}'
) on conflict (key) do nothing;
