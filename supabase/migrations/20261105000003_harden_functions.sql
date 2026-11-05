-- =============================================================================
-- Migration 3: restringe a execução das funções SECURITY DEFINER.
-- O Postgres concede EXECUTE a PUBLIC por padrão; revogar só de "anon" não basta.
-- =============================================================================

-- Função de trigger: ninguém precisa chamá-la diretamente.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- Funções de permissão: só usuários autenticados (usadas pela RLS e pelo app).
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_office_member(uuid) from public, anon;
revoke execute on function public.is_office_manager(uuid) from public, anon;
revoke execute on function public.room_office(uuid) from public, anon;
revoke execute on function public.can_access_room(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_office_member(uuid) to authenticated;
grant execute on function public.is_office_manager(uuid) to authenticated;
grant execute on function public.room_office(uuid) to authenticated;
grant execute on function public.can_access_room(uuid) to authenticated;
