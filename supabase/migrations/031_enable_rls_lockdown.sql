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

-- Belt-and-suspenders: strip every default grant to anon/authenticated across the
-- whole public schema. RLS default-deny already blocks table rows, but revoking
-- table/sequence/function EXECUTE + DML privileges removes the grant surface too.
-- service_role is NOT touched, so edge functions keep full access.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
