-- =============================================================================
-- Migration 11: setores da Tete à tete (nova organização da Sede).
--  Sala Principal (12) -> Setor TAT (cinza)
--  Sala 01 (agora 12 cadeiras) -> Setor Frédy (azul)
--  Sala 02 (agora 6 cadeiras) -> Setor Financeiro (verde-escuro)
--  Sala 03 (2) -> REUNIÃO
-- =============================================================================

do $$
declare oid uuid;
begin
  select id into oid from public.offices where slug = 'sede';
  if oid is null then return; end if;
  update public.rooms set name = 'Setor TAT', theme = 'tete', capacity = 12 where office_id = oid and zone_key = 'sala-principal';
  update public.rooms set name = 'Setor Frédy', theme = 'fredy', capacity = 12 where office_id = oid and zone_key = 'sala-01';
  update public.rooms set name = 'Setor Financeiro', theme = 'financeiro', capacity = 6 where office_id = oid and zone_key = 'sala-02';
  update public.rooms set name = 'REUNIÃO', theme = null, capacity = 2 where office_id = oid and zone_key = 'sala-03';
end $$;
