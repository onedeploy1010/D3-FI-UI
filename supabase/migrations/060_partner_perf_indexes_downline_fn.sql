-- Performance: the partner team/referral page recomputed the whole referral tree
-- live on every load via a per-node BFS (one query per downline member) using
-- ILIKE (which cannot use a btree index → sequential scan each time). This:
--   1. adds case-insensitive (lower()) indexes so referral lookups are index scans,
--   2. adds a team_nodes(wallet_address) index for the by-wallet lookup,
--   3. adds a single recursive-CTE function that returns a wallet's full partner
--      downline in ONE query, replacing the N-round-trip BFS.

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_referrals_sponsor_lower
  on public.referrals (lower(sponsor_wallet_address))
  where referral_type = 'partner' and status = 'active';

create index if not exists idx_referrals_wallet_lower
  on public.referrals (lower(wallet_address))
  where referral_type = 'partner' and status = 'active';

create index if not exists idx_team_nodes_wallet
  on public.team_nodes (wallet_address);

-- ── Downline as a single recursive CTE ───────────────────────────────────────
-- Returns every wallet in the partner downline of `root_wallet` (all depths),
-- case-insensitive, cycle-safe (UNION dedups; depth cap is a hard backstop).
create or replace function public.partner_downline_wallets(root_wallet text)
returns table (wallet_address text)
language sql
stable
as $$
  with recursive tree as (
    select r.wallet_address, 1 as depth
    from public.referrals r
    where lower(r.sponsor_wallet_address) = lower(root_wallet)
      and r.referral_type = 'partner'
      and r.status = 'active'
    union
    select r.wallet_address, t.depth + 1
    from public.referrals r
    join tree t on lower(r.sponsor_wallet_address) = lower(t.wallet_address)
    where r.referral_type = 'partner'
      and r.status = 'active'
      and t.depth < 64
  )
  select distinct tree.wallet_address from tree;
$$;
