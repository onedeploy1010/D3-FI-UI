-- User UI preferences (replaces client localStorage)
alter table public.ai_user_accounts
  add column if not exists preferences jsonb not null default '{}'::jsonb;
