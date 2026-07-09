-- Link monthly dividends to multisig proposals; committee dividend weights

alter table public.dividend_accruals drop constraint if exists dividend_accruals_status_check;
alter table public.dividend_accruals add constraint dividend_accruals_status_check
  check (status in ('pending', 'multisig_pending', 'claimable', 'claimed', 'none'));

alter table public.dividend_accruals
  add column if not exists multisig_proposal_id uuid references public.multisig_proposals (id) on delete set null;

create index if not exists idx_dividend_multisig_proposal
  on public.dividend_accruals (multisig_proposal_id)
  where multisig_proposal_id is not null;

alter table public.committee_members
  add column if not exists dividend_weight_pct numeric(5, 2) check (dividend_weight_pct is null or (dividend_weight_pct >= 0 and dividend_weight_pct <= 100));
