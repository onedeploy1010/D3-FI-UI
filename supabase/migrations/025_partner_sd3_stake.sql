-- UD3 stake positions: no USDT intent, 2× exit; other positions keep 6× exit in app logic.

alter table public.partner_stake_positions
  alter column intent_id drop not null;

alter table public.partner_stake_positions
  drop constraint if exists partner_stake_positions_kind_check;

alter table public.partner_stake_positions
  add constraint partner_stake_positions_kind_check
  check (kind in ('partner_join', 'crowdfund_stake', 'sd3'));

alter table public.partner_stake_positions
  add column if not exists exit_multiplier numeric(8, 2) not null default 6;

comment on column public.partner_stake_positions.exit_multiplier is
  'Accrued USDT yield exits when principal_usdt × exit_multiplier is reached (UD3=2, others=6)';

update public.partner_stake_positions
set exit_multiplier = case when kind = 'sd3' then 2 else 6 end
where exit_multiplier is distinct from case when kind = 'sd3' then 2 else 6 end;
