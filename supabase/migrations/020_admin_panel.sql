-- Admin panel: operators, subsidy helpdesk tickets, market leader status

create table if not exists admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'admin' check (role in ('superadmin', 'admin', 'support')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_users enable row level security;

create policy admin_users_self_read on admin_users
  for select using (auth.uid() = user_id);

create policy admin_users_superadmin_write on admin_users
  for all using (
    exists (
      select 1 from admin_users au
      where au.user_id = auth.uid() and au.role = 'superadmin'
    )
  );

alter table partner_accounts
  add column if not exists market_leader_status text not null default 'none';

alter table partner_accounts
  drop constraint if exists partner_accounts_market_leader_status_check;

alter table partner_accounts
  add constraint partner_accounts_market_leader_status_check
  check (market_leader_status in ('none', 'pending', 'approved', 'rejected'));

create table if not exists partner_subsidy_tickets (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  kind text not null check (kind in ('partner_subsidy', 'market_subsidy', 'market_leader')),
  amount_usd numeric,
  purpose text not null default '',
  status text not null default 'open' check (
    status in ('open', 'pending_info', 'under_review', 'approved', 'rejected', 'paid', 'closed')
  ),
  team_performance_usd numeric not null default 0,
  daily_new_performance_usd numeric not null default 0,
  personal_performance_usd numeric not null default 0,
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz,
  admin_note text,
  assigned_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_subsidy_tickets_wallet_idx
  on partner_subsidy_tickets (wallet_address);

create index if not exists partner_subsidy_tickets_status_idx
  on partner_subsidy_tickets (status, applied_at desc);

create table if not exists partner_subsidy_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references partner_subsidy_tickets (id) on delete cascade,
  author_type text not null check (author_type in ('applicant', 'admin', 'system')),
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists partner_subsidy_messages_ticket_idx
  on partner_subsidy_messages (ticket_id, created_at);

alter table partner_subsidy_tickets enable row level security;
alter table partner_subsidy_messages enable row level security;

-- Applicants read own tickets via wallet-scoped JWT claims are not available;
-- partner app uses Edge Function with service role. Admins read via admin API.

create policy admin_read_subsidy_tickets on partner_subsidy_tickets
  for select using (
    exists (select 1 from admin_users au where au.user_id = auth.uid())
  );

create policy admin_write_subsidy_tickets on partner_subsidy_tickets
  for all using (
    exists (
      select 1 from admin_users au
      where au.user_id = auth.uid() and au.role in ('superadmin', 'admin', 'support')
    )
  );

create policy admin_read_subsidy_messages on partner_subsidy_messages
  for select using (
    exists (select 1 from admin_users au where au.user_id = auth.uid())
  );

create policy admin_write_subsidy_messages on partner_subsidy_messages
  for all using (
    exists (
      select 1 from admin_users au
      where au.user_id = auth.uid() and au.role in ('superadmin', 'admin', 'support')
    )
  );
