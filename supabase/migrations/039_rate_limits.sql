-- V-16: Fixed-window rate limiting for high-risk money-movement routes.
--
-- A single table tracks hit counts per (bucket, window_start). The application
-- computes the window boundary (floor(now/windowSec)*windowSec) and upserts,
-- incrementing `hits` on conflict; when the new count exceeds the route's limit
-- the caller returns HTTP 429.
--
-- Access model mirrors the rest of the security lockdown:
--   * RLS enabled (default-deny for anon/authenticated; service_role bypasses RLS)
--   * table grants revoked from anon/authenticated, granted to service_role
-- Edge functions use the service-role key, so they are unaffected.
--
-- Idempotent: create-if-not-exists + guarded grants.

create table if not exists public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limit_hits enable row level security;

revoke all on public.rate_limit_hits from anon, authenticated;
grant all on public.rate_limit_hits to service_role;

-- Atomic increment helper: insert the window row (hits=1) or bump an existing
-- one, returning the post-increment count in a single round trip. SECURITY
-- DEFINER + fixed search_path; execute granted to service_role only.
create or replace function public.increment_rate_limit(p_bucket text, p_window_start timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits int;
begin
  insert into public.rate_limit_hits (bucket, window_start, hits)
    values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start)
    do update set hits = public.rate_limit_hits.hits + 1
  returning hits into v_hits;
  return v_hits;
end;
$$;

revoke all on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;
