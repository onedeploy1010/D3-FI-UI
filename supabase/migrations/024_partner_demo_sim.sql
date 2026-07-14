-- Demo partner daily simulation state (cron tick advances tree + UD3 settle).
create table if not exists public.partner_demo_sim_state (
  id text primary key default 'default',
  state_json jsonb not null default '{}'::jsonb,
  last_tick_date date,
  updated_at timestamptz not null default now()
);

comment on table public.partner_demo_sim_state is
  'Serialized demo partner tree + UD3 pending/settled; advanced by daily cron / catch-up.';

alter table public.partner_demo_sim_state enable row level security;
