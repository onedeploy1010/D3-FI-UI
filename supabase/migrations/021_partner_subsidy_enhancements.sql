-- Partner subsidy: admin-configurable rates, application type, receipt attachments

create table if not exists partner_program_settings (
  id int primary key default 1 check (id = 1),
  partner_subsidy_rate_pct numeric(5, 2) not null default 10,
  market_subsidy_rate_pct numeric(5, 2) not null default 5,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into partner_program_settings (id)
values (1)
on conflict (id) do nothing;

alter table partner_subsidy_tickets
  add column if not exists application_type text check (application_type in ('reserve', 'reimbursement'));

alter table partner_subsidy_tickets
  add column if not exists receipt_paths jsonb not null default '[]'::jsonb;

alter table partner_program_settings enable row level security;

create policy admin_read_partner_program_settings on partner_program_settings
  for select using (
    exists (select 1 from admin_users au where au.user_id = auth.uid())
  );

create policy admin_write_partner_program_settings on partner_program_settings
  for update using (
    exists (
      select 1 from admin_users au
      where au.user_id = auth.uid() and au.role in ('superadmin', 'admin')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-subsidy-receipts',
  'partner-subsidy-receipts',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do nothing;
