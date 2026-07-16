-- V-08: Maker-checker approvals for payout-authorizing admin actions.
--
-- Payout-authorizing admin mutations (flipping a subsidy ticket to approved/paid,
-- or changing program-settings reward RATE fields) no longer execute on a single
-- admin's request. They are recorded here as `pending` and must be approved by a
-- DIFFERENT admin before the change is applied (status -> 'executed').
--
-- Idempotent: create-if-not-exists throughout. RLS enabled with no permissive
-- policy = default-deny for anon/authenticated; service_role bypasses RLS so the
-- admin edge function (service-role key) keeps full access.

create table if not exists public.admin_action_approvals (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_type text,
  target_id text,
  payload jsonb,
  requested_by uuid not null,
  requested_at timestamptz default now(),
  approved_by uuid,
  approved_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'executed')),
  reason text
);

alter table public.admin_action_approvals enable row level security;

-- Strip any default grants to browser-facing roles; grant only service_role.
revoke all on public.admin_action_approvals from anon, authenticated;
grant all on public.admin_action_approvals to service_role;

-- Fast lookup of the pending queue (GET /admin/approvals).
create index if not exists admin_action_approvals_status_idx
  on public.admin_action_approvals (status, requested_at desc);
