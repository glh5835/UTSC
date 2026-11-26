-- Authenticated users may permanently remove their own account after signing in again.
-- The cloud RLS acceptance also uses the privileged server role for scoped row
-- verification and its independent path ownership constraint probe.
grant select on public.profiles, public.experiences, public.user_skills,
  public.favorites, public.learning_paths, public.path_items to service_role;
grant insert on public.path_items to service_role;

create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_session_id uuid := (auth.jwt() ->> 'session_id')::uuid;
begin
  if caller_id is null
    or not coalesce((auth.jwt() -> 'amr') @> '[{"method":"password"}]'::jsonb, false)
    or not exists (
    select 1
    from auth.sessions
    where id = caller_session_id
      and user_id = caller_id
      and created_at >= now() - interval '5 minutes'
  ) then
    raise exception 'A recent sign-in is required to delete your account'
      using errcode = '42501';
  end if;

  -- The existing foreign keys remove the profile and each dependent table in
  -- this transaction. Auth also removes sessions and refresh tokens.
  delete from auth.users where id = caller_id;
end;
$$;

revoke all on function public.delete_own_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_own_account() to authenticated;
