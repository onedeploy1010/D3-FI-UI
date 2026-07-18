-- 051: Admin RBAC — expanded role presets + guaranteed permissions/created_at.
--
-- The RBAC redesign adds two role presets (finance, auditor) on top of the
-- original superadmin/admin/support, and a code-side permission catalog. No new
-- table is required: role presets live in code (adminAuth.ts). This migration
-- only:
--   1. Guarantees admin_users.permissions and admin_users.created_at exist
--      (idempotent — both already exist since migration 020, so these are safe
--      no-ops on the current schema; kept for fresh/partial installs).
--   2. Relaxes the role CHECK constraint to allow the new presets so PATCH/POST
--      /admins may persist role='finance' / role='auditor'.
--
-- NOTE ON permissions TYPE: admin_users.permissions is text[] (migration 020) and
-- is read as a string[] by _shared/adminAuth.ts. We deliberately DO NOT convert it
-- to jsonb — text[] already round-trips as a JSON string array via supabase-js and
-- a type change would be a breaking, non-idempotent rewrite of existing rows. The
-- `if not exists` guard below preserves the existing text[] column untouched.
--
-- Idempotent. RLS is left exactly as-is (admin_users is already RLS'd; the
-- service-role admin edge function bypasses RLS, and the self-read / superadmin
-- policies from migrations 020/038/044 continue to apply to the authenticated role).

alter table public.admin_users
  add column if not exists permissions text[] not null default '{}';

alter table public.admin_users
  add column if not exists created_at timestamptz not null default now();

-- Allow the expanded RBAC role set. The original inline CHECK from migration 020
-- is named admin_users_role_check; drop-if-exists keeps this re-runnable.
alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
    check (role in ('superadmin', 'admin', 'finance', 'support', 'auditor'));

comment on column public.admin_users.permissions is
  'Explicit granular RBAC permission keys (text[]). Superadmin bypasses checks; all other roles are authorized off this list. Catalog + role presets live in _shared/adminAuth.ts.';
