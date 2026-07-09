-- Protocol epoch announcements + bribe market (D3-Fi governance)

create table if not exists public.protocol_epochs (
  id uuid primary key default gen_random_uuid(),
  epoch_number integer not null unique,
  label text not null,
  phase text not null default 'voting'
    check (phase in ('lock', 'voting', 'bribe', 'settle', 'claim')),
  bribe_pool_added_usd numeric(18, 2) not null default 0,
  bribe_pool_tvl_usd numeric(18, 2) not null default 0,
  monthly_emission_d3 numeric(18, 2) not null default 0,
  settlement_at timestamptz not null,
  started_at timestamptz not null default now(),
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists protocol_epochs_current_idx
  on public.protocol_epochs ((is_current)) where is_current = true;

create table if not exists public.bribe_projects (
  id text primary key,
  epoch_number integer not null,
  name text not null,
  name_zh text not null,
  gauge text not null,
  bribe_amount_usd numeric(18, 2) not null default 0,
  per_vote_usd numeric(18, 6) not null default 0,
  deadline_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended')),
  description_zh text,
  description_en text,
  website text,
  total_votes numeric(18, 2) not null default 0,
  voters integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_bribe_projects_epoch on public.bribe_projects (epoch_number, sort_order);

alter table public.protocol_epochs enable row level security;
alter table public.bribe_projects enable row level security;

create policy "protocol_epochs_read_all" on public.protocol_epochs for select using (true);
create policy "bribe_projects_read_all" on public.bribe_projects for select using (true);
