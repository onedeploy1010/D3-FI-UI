-- 050: Treasury transfer hardening (T-B/T-D/T-E) + mobile admin UI support.
--
-- Part 1 (treasury hardening):
--   T-B (maker-checker): record who PROPOSED a transfer so broadcast can enforce
--        that a DIFFERENT admin broadcasts it (separation of duties).
--   T-E (idempotency):   a client-supplied request_key with a UNIQUE constraint so
--        a retried propose returns the existing row instead of minting a second
--        Turnkey signing activity.
--   T-D (allowlist):     treasury_transfer_allowlist — outbound `to` addresses must
--        be pre-approved. RLS default-deny for anon/authenticated; service_role only.
--
-- Part 2 (mobile admin UI):
--   profiles.remark — a free-text admin note surfaced/edited in the member detail.
--
-- Idempotent. RLS + revoke/grant mirror migration 047's treasury table.

-- ── T-B / T-E: treasury_transfer_requests new columns ────────────────────────
alter table public.treasury_transfer_requests
  add column if not exists proposed_by uuid,
  add column if not exists request_key text;

-- T-E: one row per client request key. A retried propose (same key) collides and
-- the app returns the existing row rather than signing again. Partial-unique so
-- legacy rows with a NULL key (pre-migration) don't collide with each other.
create unique index if not exists treasury_transfer_requests_request_key_uniq
  on public.treasury_transfer_requests (request_key)
  where request_key is not null;

comment on column public.treasury_transfer_requests.proposed_by is
  'Admin user_id who PROPOSED this transfer. Broadcast must be performed by a DIFFERENT admin (maker-checker, T-B).';
comment on column public.treasury_transfer_requests.request_key is
  'Client idempotency key (T-E). UNIQUE — a duplicate propose returns the existing row without a second Turnkey activity.';

-- ── T-D: destination allowlist ───────────────────────────────────────────────
create table if not exists public.treasury_transfer_allowlist (
  address text primary key
    check (address ~ '^0x[0-9a-fA-F]{40}$'),
  label text,
  added_by uuid,
  created_at timestamptz not null default now()
);

alter table public.treasury_transfer_allowlist enable row level security;

revoke all on public.treasury_transfer_allowlist from anon, authenticated;
grant all on public.treasury_transfer_allowlist to service_role;

comment on table public.treasury_transfer_allowlist is
  'T-D: pre-approved outbound treasury destinations. A treasury transfer whose `to` is not listed here is rejected before any Turnkey signing.';

-- ── Part 2: profiles.remark (admin note, editable via PATCH /members/:wallet) ─
alter table public.profiles
  add column if not exists remark text;

comment on column public.profiles.remark is
  'Free-text admin note for this member; set via admin PATCH /members/:wallet (requires members.write, audited).';
