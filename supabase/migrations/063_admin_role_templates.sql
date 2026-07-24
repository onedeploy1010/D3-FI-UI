-- Custom admin role templates (角色模板): named permission bundles created by
-- superadmins in the Roles page, alongside the built-in code presets.
-- Service-role access only (admin edge function) — RLS locked, no policies.

create table if not exists public.admin_role_templates (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  label text not null check (char_length(label) between 1 and 40),
  permissions jsonb not null default '[]'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_role_templates is
  '自定义角色模板 — superadmin-authored permission bundles; built-in role presets stay in code (adminAuth.ts ROLE_PRESETS)';

alter table public.admin_role_templates enable row level security;
