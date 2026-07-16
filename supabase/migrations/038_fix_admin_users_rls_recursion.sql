-- Fix: infinite recursion (42P17) in admin_users RLS.
--
-- migration 020's `admin_users_superadmin_write` policy is FOR ALL and its USING
-- clause does `select 1 from admin_users ...` — evaluating the policy on admin_users
-- re-triggers the same policy → infinite recursion on every read/write, breaking
-- admin login. Any other policy that subqueries admin_users hits it too.
--
-- Move the superadmin check into a SECURITY DEFINER function that runs as the
-- function owner (RLS bypassed), so the check no longer recurses.

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role = 'superadmin'
  );
$$;

revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated, service_role;

drop policy if exists admin_users_superadmin_write on public.admin_users;
create policy admin_users_superadmin_write on public.admin_users
  for all using (public.is_superadmin()) with check (public.is_superadmin());
