-- Fix: admin login "Account is not authorised for the admin panel".
--
-- The security lockdown revoked table privileges from anon/authenticated and
-- granted them to service_role. But the admin panel logs in as a normal Supabase
-- Auth user (role `authenticated`) and must read its OWN admin_users row to load
-- its profile/permissions. Without a table-level SELECT grant, the query is denied
-- at the privilege layer (42501 "permission denied for table admin_users") BEFORE
-- RLS is ever evaluated — so loadAdminProfile() gets an error, returns null, and
-- the app reports the account as unauthorised.
--
-- Grant SELECT to `authenticated`; the existing RLS policy admin_users_self_read
-- (auth.uid() = user_id) still restricts each admin to their own row, so this does
-- not widen visibility. Writes remain gated by is_superadmin() (migration 038).
--
-- Idempotent.

grant select on public.admin_users to authenticated;
