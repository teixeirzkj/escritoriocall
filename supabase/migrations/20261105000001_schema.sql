-- =============================================================================
-- Andar — escritório virtual
-- Migration 1: esquema, funções de permissão, RLS e storage.
-- Presença online e posições NÃO ficam no banco (vão pelo Ably).
-- =============================================================================

-- gen_random_uuid() é nativo do PostgreSQL 13+ (não precisa de pgcrypto).

do $$ begin
  create type public.app_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.office_role as enum ('member', 'moderator', 'owner');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

create table if not exists public.avatars (
  id          text primary key,
  name        text not null,
  description text,
  preset      jsonb not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 32),
  avatar_id     text references public.avatars(id) on delete set null,
  avatar_config jsonb,
  photo_url     text check (photo_url is null or char_length(photo_url) <= 500),
  role          public.app_role not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.offices (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name             text not null check (char_length(name) between 2 and 60),
  description      text check (description is null or char_length(description) <= 280),
  map_key          text not null default 'hq-v1',
  is_public        boolean not null default true,
  proximity_radius int not null default 128 check (proximity_radius between 48 and 480),
  proximity_mode   text not null default 'fade' check (proximity_mode in ('cutoff', 'fade')),
  max_online       int not null default 50 check (max_online between 1 and 500),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.office_members (
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      public.office_role not null default 'member',
  banned    boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (office_id, user_id)
);
create index if not exists office_members_user_idx on public.office_members(user_id);

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  office_id  uuid not null references public.offices(id) on delete cascade,
  zone_key   text not null check (zone_key ~ '^[a-z0-9-]{2,40}$'),
  name       text not null check (char_length(name) between 2 and 60),
  capacity   int not null check (capacity between 1 and 50),
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, zone_key)
);
create index if not exists rooms_office_idx on public.rooms(office_id);

-- Lista de acesso para salas privadas.
create table if not exists public.room_members (
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  added_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members(user_id);

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  office_id    uuid not null references public.offices(id) on delete cascade,
  room_id      uuid references public.rooms(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now(),
  constraint messages_single_scope check (not (room_id is not null and recipient_id is not null)),
  constraint messages_not_self check (recipient_id is null or recipient_id <> sender_id)
);
create index if not exists messages_office_public_idx
  on public.messages(office_id, created_at desc)
  where room_id is null and recipient_id is null;
create index if not exists messages_room_idx
  on public.messages(room_id, created_at desc)
  where room_id is not null;
create index if not exists messages_dm_idx
  on public.messages(office_id, least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc)
  where recipient_id is not null;

create table if not exists public.user_settings (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  mic_on_join     boolean not null default false,
  cam_on_join     boolean not null default false,
  audio_input_id  text check (audio_input_id is null or char_length(audio_input_id) <= 200),
  video_input_id  text check (video_input_id is null or char_length(video_input_id) <= 200),
  audio_output_id text check (audio_output_id is null or char_length(audio_output_id) <= 200),
  master_volume   real not null default 1 check (master_volume between 0 and 1),
  show_names      boolean not null default true,
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists offices_touch on public.offices;
create trigger offices_touch before update on public.offices
  for each row execute function public.touch_updated_at();
drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Criação automática de perfil ao cadastrar
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dn text;
begin
  dn := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 32);
  if char_length(dn) < 2 then
    dn := left(split_part(coalesce(new.email, 'pessoa'), '@', 1), 32);
  end if;
  if char_length(dn) < 2 then
    dn := 'Pessoa';
  end if;
  insert into public.profiles (id, display_name) values (new.id, dn)
    on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Funções de permissão (SECURITY DEFINER evita recursão de RLS)
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_office_member(oid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.office_members m
    where m.office_id = oid and m.user_id = auth.uid() and not m.banned
  );
$$;

create or replace function public.is_office_manager(oid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.office_members m
    where m.office_id = oid and m.user_id = auth.uid() and not m.banned
      and m.role in ('moderator', 'owner')
  );
$$;

create or replace function public.room_office(rid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.office_id from public.rooms r where r.id = rid;
$$;

create or replace function public.can_access_room(rid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid and (
      public.is_office_manager(r.office_id)
      or (
        public.is_office_member(r.office_id)
        and (
          not r.is_private
          or exists (select 1 from public.room_members rm where rm.room_id = r.id and rm.user_id = auth.uid())
        )
      )
    )
  );
$$;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_office_member(uuid) from anon;
revoke execute on function public.is_office_manager(uuid) from anon;
revoke execute on function public.room_office(uuid) from anon;
revoke execute on function public.can_access_room(uuid) from anon;

-- -----------------------------------------------------------------------------
-- Privilégios de coluna: usuários não podem alterar o próprio papel.
-- -----------------------------------------------------------------------------

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_id, avatar_config, photo_url) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.avatars        enable row level security;
alter table public.profiles       enable row level security;
alter table public.offices        enable row level security;
alter table public.office_members enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_members   enable row level security;
alter table public.messages       enable row level security;
alter table public.user_settings  enable row level security;

-- avatars: catálogo público; escrita só admin
drop policy if exists avatars_read on public.avatars;
create policy avatars_read on public.avatars for select to anon, authenticated using (true);
drop policy if exists avatars_admin on public.avatars;
create policy avatars_admin on public.avatars for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: autenticados veem nomes/avatares; cada um edita o seu
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- offices
drop policy if exists offices_read on public.offices;
create policy offices_read on public.offices for select to authenticated
  using (is_public or public.is_office_member(id) or public.is_admin());
drop policy if exists offices_insert on public.offices;
create policy offices_insert on public.offices for insert to authenticated
  with check (public.is_admin());
drop policy if exists offices_update on public.offices;
create policy offices_update on public.offices for update to authenticated
  using (public.is_office_manager(id)) with check (public.is_office_manager(id));
drop policy if exists offices_delete on public.offices;
create policy offices_delete on public.offices for delete to authenticated
  using (public.is_admin());

-- office_members
drop policy if exists members_read on public.office_members;
create policy members_read on public.office_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_office_member(office_id) or public.is_office_manager(office_id));
drop policy if exists members_join_public on public.office_members;
create policy members_join_public on public.office_members for insert to authenticated
  with check (
    user_id = (select auth.uid()) and role = 'member' and banned = false
    and exists (select 1 from public.offices o where o.id = office_id and o.is_public)
  );
drop policy if exists members_manager_insert on public.office_members;
create policy members_manager_insert on public.office_members for insert to authenticated
  with check (public.is_office_manager(office_id) and (role <> 'owner' or public.is_admin()));
drop policy if exists members_manager_update on public.office_members;
create policy members_manager_update on public.office_members for update to authenticated
  using (public.is_office_manager(office_id))
  with check (public.is_office_manager(office_id) and (role <> 'owner' or public.is_admin()));
drop policy if exists members_delete on public.office_members;
create policy members_delete on public.office_members for delete to authenticated
  using ((user_id = (select auth.uid()) and not banned) or public.is_office_manager(office_id));

-- rooms
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated
  using (public.is_office_member(office_id) or public.is_office_manager(office_id));
drop policy if exists rooms_write on public.rooms;
create policy rooms_write on public.rooms for all to authenticated
  using (public.is_office_manager(office_id)) with check (public.is_office_manager(office_id));

-- room_members
drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_office_manager(public.room_office(room_id)));
drop policy if exists room_members_write on public.room_members;
create policy room_members_write on public.room_members for all to authenticated
  using (public.is_office_manager(public.room_office(room_id)))
  with check (public.is_office_manager(public.room_office(room_id)));

-- messages
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (
    public.is_office_member(office_id) and (
      (room_id is null and recipient_id is null)
      or sender_id = (select auth.uid())
      or recipient_id = (select auth.uid())
      or (room_id is not null and public.can_access_room(room_id))
    )
  );
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_office_member(office_id)
    and (room_id is null or (public.room_office(room_id) = office_id and public.can_access_room(room_id)))
    and (recipient_id is null or exists (
      select 1 from public.office_members m
      where m.office_id = messages.office_id and m.user_id = recipient_id and not m.banned
    ))
  );
drop policy if exists messages_moderate on public.messages;
create policy messages_moderate on public.messages for delete to authenticated
  using (public.is_office_manager(office_id));

-- user_settings
drop policy if exists settings_own on public.user_settings;
create policy settings_own on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Storage: bucket de fotos de perfil
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: dono envia" on storage.objects;
create policy "avatars: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars: dono atualiza" on storage.objects;
create policy "avatars: dono atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars: dono remove" on storage.objects;
create policy "avatars: dono remove" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars: dono lista" on storage.objects;
create policy "avatars: dono lista" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
