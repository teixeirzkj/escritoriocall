-- =============================================================================
-- Migration 2: dados iniciais (catálogo de personagens, escritório e salas).
-- Idempotente: pode ser executada mais de uma vez.
-- =============================================================================

insert into public.avatars (id, name, description, preset, sort_order) values
  ('dev',       'Dev',        'Moletom e headset, pronto para o deploy.',
   '{"base":"dev","skin":"#e8b48f","hairStyle":"curto","hairColor":"#4a2e1c","body":"moletom","outfit":"#2f6fde","pants":"#2b3445","accessory":"fone"}', 1),
  ('design',    'Design',     'Óculos, jaqueta e olhar para detalhes.',
   '{"base":"design","skin":"#7a4a2c","hairStyle":"cacheado","hairColor":"#1f1a17","body":"jaqueta","outfit":"#e0564c","pants":"#1e293b","accessory":"oculos"}', 2),
  ('produto',   'Produto',    'Camisa social e agenda cheia.',
   '{"base":"produto","skin":"#c98e64","hairStyle":"coque","hairColor":"#b8452f","body":"camisa","outfit":"#8b5cf6","pants":"#3d4a5c","accessory":"nenhum"}', 3),
  ('dados',     'Dados',      'Vestido, gráficos e café.',
   '{"base":"dados","skin":"#f6d3b3","hairStyle":"longo","hairColor":"#d9a65b","body":"vestido","outfit":"#1f9d8a","pants":"#2b3445","accessory":"nenhum"}', 4),
  ('suporte',   'Suporte',    'Boné e camiseta, sempre por perto.',
   '{"base":"suporte","skin":"#a26a43","hairStyle":"raspado","hairColor":"#1f1a17","body":"camiseta","outfit":"#f0a83a","pants":"#5c4033","accessory":"bone"}', 5),
  ('operacoes', 'Operações',  'Gorro e rabo de cavalo, sempre a postos.',
   '{"base":"operacoes","skin":"#4f2f1d","hairStyle":"rabo","hairColor":"#5b6ee1","body":"moletom","outfit":"#3a3f4b","pants":"#1f3a5f","accessory":"gorro"}', 6)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  preset = excluded.preset,
  sort_order = excluded.sort_order;

-- Escritório padrão (público: qualquer pessoa cadastrada pode entrar).
insert into public.offices (slug, name, description, is_public, proximity_radius, proximity_mode)
values ('sede', 'Sede', 'Escritório principal da equipe.', true, 128, 'fade')
on conflict (slug) do nothing;

-- Salas do mapa hq-v1 para o escritório padrão.
insert into public.rooms (office_id, zone_key, name, capacity, is_private)
select o.id, z.zone_key, z.name, z.capacity, z.is_private
from public.offices o
cross join (values
  ('sala-principal', 'Sala Principal',     15, false),
  ('sala-01',        'Sala de Reunião 01',  6, false),
  ('sala-02',        'Sala de Reunião 02',  4, false),
  ('sala-03',        'Sala de Reunião 03',  8, false),
  ('sala-04',        'Sala de Foco 04',     3, true)
) as z(zone_key, name, capacity, is_private)
where o.slug = 'sede'
on conflict (office_id, zone_key) do nothing;
