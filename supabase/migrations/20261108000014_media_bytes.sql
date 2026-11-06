-- =============================================================================
-- Migration 14: tráfego de mídia (Cloudflare Realtime cobra por GB recebido).
-- media_usage.bytes soma o que cada pessoa recebeu por dia; o limite do plano
-- passa a ter "cf_gb" (padrão: 1.000 GB grátis por mês).
-- =============================================================================

alter table public.media_usage add column if not exists bytes bigint not null default 0;

-- Soma 1 minuto e os bytes recebidos (chamada só pelo servidor, com a chave secreta).
create or replace function public.bump_media_bytes(p_office uuid, p_user uuid, p_kind text, p_bytes bigint, p_minute boolean)
returns void language sql security definer set search_path = public as $$
  insert into public.media_usage (day, office_id, user_id, kind, minutes, bytes)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_office, p_user, p_kind, case when p_minute then 1 else 0 end, greatest(p_bytes, 0))
  on conflict (day, office_id, user_id, kind) do update
    set minutes = public.media_usage.minutes + case when p_minute then 1 else 0 end,
        bytes = public.media_usage.bytes + greatest(p_bytes, 0);
$$;
revoke execute on function public.bump_media_bytes(uuid, uuid, text, bigint, boolean) from public, anon, authenticated;

update public.platform_settings
  set value = value || '{"cf_gb": 1000}'::jsonb
  where key = 'plan_limits' and not (value ? 'cf_gb');
