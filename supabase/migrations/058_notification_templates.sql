-- DB-driven, multi-language notification (小铃铛) templates so new reminder types
-- can be added/edited without a code deploy. user_notifications reference a
-- template_key + params; the fetch endpoint renders title/message in the viewer's
-- language from the template content.
create table if not exists public.notification_templates (
  key text primary key,
  category text not null default 'system'
    check (category in ('protocol', 'dividend', 'multisig', 'referral', 'system')),
  link_path text,
  -- { "<lang>": { "title": "...", "message": "... {param} ..." }, ... }
  content jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_templates enable row level security;
-- Templates are non-secret display copy; readable by anyone, writable by service_role only.
drop policy if exists notification_templates_read on public.notification_templates;
create policy notification_templates_read on public.notification_templates for select using (true);

-- user_notifications now reference a template + params; legacy rows keep their
-- inline title/message, so those columns become nullable.
alter table public.user_notifications
  add column if not exists template_key text,
  add column if not exists params jsonb;
alter table public.user_notifications alter column title_zh drop not null;
alter table public.user_notifications alter column title_en drop not null;
alter table public.user_notifications alter column message_zh drop not null;
alter table public.user_notifications alter column message_en drop not null;
