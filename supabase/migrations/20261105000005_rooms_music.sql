-- =============================================================================
-- Migration 5:
--  - Capacidades das salas: Principal 12, 01 = 6, 02 = 4, 03 = 2 (uma cadeira por pessoa no mapa).
--  - Caixa de som: estado da música tocando em cada sala (lido por quem acessa a sala;
--    gravado pelo servidor via /api/music, que valida o acesso à sala; a RLS de rooms
--    continua permitindo escrita direta só a gestores).
-- =============================================================================

update public.rooms r set capacity = v.capacity
from (values
  ('sala-principal', 12),
  ('sala-01',         6),
  ('sala-02',         4),
  ('sala-03',         2)
) as v(zone_key, capacity)
where r.zone_key = v.zone_key;

alter table public.rooms add column if not exists music jsonb;
