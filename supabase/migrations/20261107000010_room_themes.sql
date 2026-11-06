-- =============================================================================
-- Migration 10: identidade visual das salas (placa com o nome na porta e banner
-- com a logo dentro). E a Sede da Tete à tete com os seus setores.
-- =============================================================================

alter table public.rooms add column if not exists theme text
  check (theme is null or theme in ('tete', 'fredy', 'duda', 'financeiro'));

-- Sede da Tete à tete: sala de reunião + setores Frédy, Duda e Financeiro.
do $$
declare oid uuid;
begin
  select id into oid from public.offices where slug = 'sede';
  if oid is null then return; end if;
  update public.offices set name = 'Tete à tete', description = 'Marketing de conversa: Frédy, Duda e Financeiro.' where id = oid;
  update public.rooms set name = 'Sala de Reunião', theme = 'tete' where office_id = oid and zone_key = 'sala-principal';
  update public.rooms set name = 'Setor Frédy', theme = 'fredy' where office_id = oid and zone_key = 'sala-01';
  update public.rooms set name = 'Setor Duda', theme = 'duda' where office_id = oid and zone_key = 'sala-02';
  update public.rooms set name = 'Financeiro', theme = 'financeiro' where office_id = oid and zone_key = 'sala-03';
end $$;
