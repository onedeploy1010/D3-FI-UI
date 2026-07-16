-- SIWE (Sign-In With Ethereum) auth — replaces Privy JWT for user identity.
--
-- The wallet signs a nonce-bound EIP-4361 message at login; the edge function
-- verifies the signature and issues a short-lived HMAC session token. To make the
-- handshake replay-proof, every nonce is single-use and lives at most ~5 minutes.
--
-- Access model mirrors the rest of the security lockdown (031/039):
--   * RLS enabled (default-deny for anon/authenticated; service_role bypasses RLS)
--   * table grants revoked from anon/authenticated, granted to service_role
-- Edge functions use the service-role key, so only they can read/write nonces.
--
-- NOTE: numbered 042 (not 039) because 039_rate_limits.sql already exists.
--
-- Idempotent: create-if-not-exists + guarded grants.

create table if not exists public.siwe_nonces (
  address text not null,
  nonce text primary key,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Lets the sweeper / expiry filter scan by expiry without a full table scan.
create index if not exists siwe_nonces_expires_at_idx on public.siwe_nonces (expires_at);

alter table public.siwe_nonces enable row level security;

-- No anon/authenticated access at all: nonces are issued and consumed exclusively
-- by the edge functions (service_role), which bypass RLS. No policies are created,
-- so RLS is default-deny for every other role.
revoke all on public.siwe_nonces from anon, authenticated;
grant all on public.siwe_nonces to service_role;
