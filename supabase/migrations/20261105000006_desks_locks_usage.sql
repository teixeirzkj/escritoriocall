-- =============================================================================
-- Migration 6:
--  - Mesa fixa: cada membro pode ter uma mesa (índice) no escritório.
--  - Sala trancada: quem tranca fica registrado (destranca ao sair / sala vazia).
--  - Uso de áudio/vídeo: minutos por dia, pessoa e tipo (proximidade / reunião).
-- =============================================================================

alter table public.office_members add column if not exists desk int check (desk between 0 and 99);
create unique index if not exists office_members_desk_uniq
  on public.office_members (office_id, desk) where desk is not null;

alter table public.rooms add column if not exists locked_by uuid references auth.users(id) on delete set null;

create table if not exists public.media_usage (
  day       date not null,
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null check (kind in ('proximity', 'meeting')),
  minutes   int  not null default 0,
  primary key (day, office_id, user_id, kind)
);
alter table public.media_usage enable row level security;
drop policy if exists media_usage_admin_read on public.media_usage;
create policy media_usage_admin_read on public.media_usage for select to authenticated
  using (public.is_admin());

-- Soma 1 minuto (chamada só pelo servidor, com a chave secreta).
create or replace function public.bump_media_usage(p_office uuid, p_user uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  insert into public.media_usage (day, office_id, user_id, kind, minutes)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_office, p_user, p_kind, 1)
  on conflict (day, office_id, user_id, kind) do update set minutes = public.media_usage.minutes + 1;
$$;
revoke execute on function public.bump_media_usage(uuid, uuid, text) from public, anon, authenticated;
