-- V-07: A wallet may not be its own referral sponsor.
--
-- Self-referral would let a user inflate their own network/performance figures and
-- collect referral rewards on their own deposits. This CHECK forbids
-- sponsor == wallet (case-insensitive). sponsor_wallet_address is nullable
-- (referrals in 001 sets it null on sponsor delete); a NULL sponsor yields NULL,
-- which does NOT violate the CHECK, so organic-root rows are unaffected.

do $$
begin
  alter table public.referrals
    add constraint referrals_no_self
    check (lower(sponsor_wallet_address) <> lower(wallet_address));
exception when duplicate_object then null;
end $$;
