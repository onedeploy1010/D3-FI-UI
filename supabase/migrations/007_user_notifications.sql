-- D3 protocol notifications (Portal / D3-Fi / Union)

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.profiles (wallet_address) on delete cascade,
  title_zh text not null,
  title_en text not null,
  message_zh text not null,
  message_en text not null,
  category text not null default 'system'
    check (category in ('protocol', 'dividend', 'multisig', 'referral', 'system')),
  link_path text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_wallet
  on public.user_notifications (wallet_address, created_at desc);

alter table public.user_notifications enable row level security;

create policy "user_notifications_read_own" on public.user_notifications for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);
