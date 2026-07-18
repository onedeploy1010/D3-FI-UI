-- 052: Add the `super_partner` (项目方/超级合伙人) admin role.
--
-- The standalone multisig system identifies the project party as a `super_partner`
-- admin_user (set via the admin-panel roles page). Its permission preset lives in
-- code (_shared/adminAuth.ts) and includes treasury.write, so — per the escalation
-- guard (assertCanManageAdmin) — only a superadmin may create one.
--
-- This migration only widens the admin_users.role CHECK constraint to allow the
-- new role value. Idempotent (drop-if-exists + re-add). RLS unchanged.

alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
    check (role in ('superadmin', 'admin', 'finance', 'support', 'auditor', 'super_partner'));

comment on constraint admin_users_role_check on public.admin_users is
  'Allowed RBAC roles. super_partner (项目方) = fund-authority identity for the standalone multisig system. Presets in _shared/adminAuth.ts.';
