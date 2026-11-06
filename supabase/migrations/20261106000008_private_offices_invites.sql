-- =============================================================================
-- Migration 8: sedes privadas com convite (estilo "servidores").
--  - Toda sede passa a ser privada: só membros a enxergam.
--  - Cada sede tem um código de convite (link). Quem abre o link e aceita vira membro.
--  - Qualquer pessoa pode criar a própria sede (feito pelo servidor, com limite).
-- Os membros atuais continuam onde estão.
-- =============================================================================

alter table public.offices alter column is_public set default false;
update public.offices set is_public = false where is_public;

alter table public.offices
  add column if not exists invite_code text;
update public.offices
  set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where invite_code is null;
alter table public.offices
  alter column invite_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  alter column invite_code set not null;
create unique index if not exists offices_invite_code_uniq on public.offices (invite_code);

-- Só membros (e o administrador da plataforma) enxergam a sede.
drop policy if exists offices_read on public.offices;
create policy offices_read on public.offices for select to authenticated
  using (public.is_office_member(id) or public.is_admin());

-- Entrar sozinho numa sede "aberta" deixa de existir: a entrada é pelo convite (servidor).
drop policy if exists members_join_public on public.office_members;
