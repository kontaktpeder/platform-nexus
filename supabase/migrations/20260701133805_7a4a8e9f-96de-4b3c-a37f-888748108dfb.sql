
revoke execute on function public.is_org_member(uuid, uuid) from public, anon;
revoke execute on function public.org_role(uuid, uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_org() from public, anon, authenticated;
revoke execute on function public.handle_new_workspace() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.is_org_member(uuid, uuid) to authenticated;
grant execute on function public.org_role(uuid, uuid) to authenticated;
grant execute on function public.is_org_admin(uuid, uuid) to authenticated;
alter function public.set_updated_at() set search_path = public;
