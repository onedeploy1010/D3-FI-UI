-- Flash-swap (yield withdraw) fee tracking: 3% protocol fee, net paid to user.

alter table public.partner_yield_withdrawals
  add column if not exists fee_usdt numeric(18, 4) not null default 0;

alter table public.partner_yield_withdrawals
  add column if not exists net_amount_usdt numeric(18, 4) null;

comment on column public.partner_yield_withdrawals.amount_usdt is
  'Gross USDT deducted from pending yield';
comment on column public.partner_yield_withdrawals.fee_usdt is
  'Flash-swap fee (default 3% of gross)';
comment on column public.partner_yield_withdrawals.net_amount_usdt is
  'USDT actually sent to user wallet (gross − fee)';
