-- =============================================================================
-- Migration 7: agenda das salas de reunião.
-- Cada reserva ocupa uma sala num horário; os convidados recebem um aviso
-- 5 minutos antes. Escritas só pelo servidor (rota /api/bookings).
-- =============================================================================

create table if not exists public.room_bookings (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  attendees  uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint room_bookings_range check (ends_at > starts_at and ends_at - starts_at <= interval '8 hours')
);

create index if not exists room_bookings_office_time on public.room_bookings (office_id, starts_at);
create index if not exists room_bookings_room_time on public.room_bookings (room_id, starts_at);

alter table public.room_bookings enable row level security;
drop policy if exists room_bookings_member_read on public.room_bookings;
create policy room_bookings_member_read on public.room_bookings for select to authenticated
  using (public.is_office_member(office_id));
