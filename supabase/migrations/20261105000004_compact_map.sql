-- =============================================================================
-- Migration 4: mapa compacto "hq-v2".
--  - Salas: Principal (10), 01 (6), 02 (6), 03 (4). A "Sala de Foco 04" deixou de existir no mapa.
--  - Raio de proximidade maior (208px ≈ 6,5 tiles) e novo padrão.
-- =============================================================================

delete from public.rooms where zone_key = 'sala-04';

update public.rooms r set capacity = v.capacity, name = v.name
from (values
  ('sala-principal', 'Sala Principal',     10),
  ('sala-01',        'Sala de Reunião 01',  6),
  ('sala-02',        'Sala de Reunião 02',  6),
  ('sala-03',        'Sala de Reunião 03',  4)
) as v(zone_key, name, capacity)
where r.zone_key = v.zone_key;

alter table public.offices alter column proximity_radius set default 208;
update public.offices set proximity_radius = 208 where proximity_radius < 208;
