-- V-19: Enable Row Level Security on all remaining public tables + revoke anon grants.
--
-- Enabling RLS with NO permissive policy = default-deny for anon/authenticated.
-- service_role bypasses RLS entirely, so edge functions (which use the service-role
-- key) are unaffected. This closes direct PostgREST reads/writes from the browser.
--
-- Idempotent: every alter is guarded by a to_regclass existence check so it no-ops
-- if a table is absent, and enabling RLS twice is harmless.

do $$
declare
  t text;
  tables text[] := array[
    'chain_sync_cursors',
    'committee_members',
    'd3_price_settings',
    'daily_state_anchors',
    'multisig_proposals',
    'multisig_signatures',
    'multisig_wallets',
    'partner_ud3_calc_logs',
    'partner_ud3_events',
    'partner_ud3_ledger',
    'partner_ud3_settings',
    'team_nodes',
    'union_lines',
    'usd3_transfers'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security;', t);
    end if;
  end loop;
end $$;

-- Belt-and-suspenders: strip every default grant from the PUBLIC/anon role across the
-- whole public schema. anon is the unauthenticated publishable-key role and is the
-- actual V-19 threat surface (direct PostgREST reads/writes with the browser key).
--
-- NOTE: we deliberately do NOT revoke from `authenticated`. Regular app users
-- authenticate via Privy and only ever reach edge functions (service_role) — they
-- never hold a Postgres `authenticated` role. The ONLY direct table reader on the
-- `authenticated` role is the admin panel reading `admin_users`
-- (admin-panel/src/contexts/admin-auth.tsx), which is governed by that table's own
-- RLS policy (migration 020). Revoking `authenticated` here would break admin login
-- while adding no protection the per-table RLS above doesn't already provide.
-- service_role is NOT touched, so edge functions keep full access.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
