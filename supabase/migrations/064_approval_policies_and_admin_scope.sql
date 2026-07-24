-- 1) Per-permission approval policies (审批策略): whether write actions gated by
--    a permission execute with a single checker (current maker-checker default)
--    or need N co-signing approvers (多签), optionally from a designated list.
create table if not exists public.admin_approval_policies (
  permission_key text primary key,
  mode text not null default 'single' check (mode in ('single', 'multi')),
  required_approvals int not null default 2 check (required_approvals between 2 and 5),
  approver_ids uuid[] null,
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

comment on table public.admin_approval_policies is
  '审批策略 — keyed by the checker permission of an approval action (e.g. subsidies.write). mode=multi requires required_approvals co-signers; approver_ids (null = any holder of the permission) restricts who may approve.';

alter table public.admin_approval_policies enable row level security;

-- 2) Multi-approver accumulation on the maker-checker queue. approvals is an
--    array of {userId, at}; approved_count mirrors its length for optimistic
--    concurrency (co-sign updates guard on the previous count).
alter table public.admin_action_approvals
  add column if not exists approvals jsonb not null default '[]'::jsonb,
  add column if not exists approved_count int not null default 0;

-- 3) Admin data scope (伞下数据范围): when set, the admin only sees/manages
--    members inside this wallet's referral subtree (enforced in the admin
--    edge function via partner_downline_wallets).
alter table public.admin_users
  add column if not exists scope_wallet text null;

comment on column public.admin_users.scope_wallet is
  '限定该管理员可见/可管理的数据范围为此钱包的伞下(含自身); null = 不限';
