-- The profile bundle built the referral-tree edges with
--   .in('wallet_address', <every downline wallet>)
-- which serializes all wallets into the request URL. Past ~350 wallets the URL
-- blows the HTTP client's 16KB header cap (HeadersOverflowError) and the edge
-- function silently returned an EMPTY tree — big teams saw "查看下级" dead while
-- small teams worked. Return the edges from one recursive CTE instead.
create or replace function public.partner_downline_tree(root_wallet text)
returns table (
  wallet_address text,
  sponsor_wallet_address text,
  performance_weight numeric
)
language sql
stable
as $$
  with recursive tree as (
    select r.wallet_address, r.sponsor_wallet_address, r.performance_weight, 1 as depth
    from public.referrals r
    where lower(r.sponsor_wallet_address) = lower(root_wallet)
      and r.referral_type = 'partner'
      and r.status = 'active'
    union
    select r.wallet_address, r.sponsor_wallet_address, r.performance_weight, t.depth + 1
    from public.referrals r
    join tree t on lower(r.sponsor_wallet_address) = lower(t.wallet_address)
    where r.referral_type = 'partner'
      and r.status = 'active'
      and t.depth < 64
  )
  select distinct tree.wallet_address, tree.sponsor_wallet_address, tree.performance_weight
  from tree;
$$;
