-- PoC composite score — updated each Epoch (30d)

create table if not exists public.poc_scores (
  wallet_address text primary key references public.profiles (wallet_address) on delete cascade,
  epoch_label text not null default '—',
  level_label text not null default 'V0',
  composite_score numeric(5, 2) not null default 0 check (composite_score >= 0 and composite_score <= 100),
  level_diff_rate numeric(5, 2) not null default 0,
  diff_floor_pct numeric(5, 2) not null default 16,
  diff_ceil_pct numeric(5, 2) not null default 38,
  dim_h numeric(5, 2) not null default 0,
  dim_c numeric(5, 2) not null default 0,
  dim_a numeric(5, 2) not null default 0,
  dim_r numeric(5, 2) not null default 0,
  dim_e numeric(5, 2) not null default 0,
  raw_h_zh text,
  raw_h_en text,
  raw_c_zh text,
  raw_c_en text,
  raw_a_zh text,
  raw_a_en text,
  raw_r_zh text,
  raw_r_en text,
  raw_e_zh text,
  raw_e_en text,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists poc_scores_updated_at on public.poc_scores;
create trigger poc_scores_updated_at before update on public.poc_scores
  for each row execute function public.set_updated_at();

alter table public.poc_scores enable row level security;

create policy "poc_read_own" on public.poc_scores for select using (
  lower(wallet_address) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
);
