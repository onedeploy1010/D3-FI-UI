-- Security monitoring / alerting store (Agent N).
--
-- runSecurityScan() (_shared/securityMonitor.ts, triggered by the treasury
-- `/internal/security-scan` cron) writes de-duplicated alerts here. The admin
-- security API (Agent O) reads/acks them; the notifier pushes P>=threshold ones
-- to Telegram/Slack.
--
-- Dedup rule: while an alert for a given rule_id is still `open`, no second row
-- is inserted (enforced in code by raiseAlert AND, defensively, by a partial
-- unique index below).
--
-- Idempotent: create-if-not-exists throughout. RLS enabled with no permissive
-- policy = default-deny for anon/authenticated; service_role bypasses RLS so the
-- edge functions (service-role key) keep full access.

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null
    check (severity in ('P0', 'P1', 'P2', 'P3')),
  rule_id text not null,
  title text,
  detail jsonb,
  entity_type text,
  entity_id text,
  status text not null default 'open'
    check (status in ('open', 'ack', 'resolved')),
  auto_paused boolean not null default false,
  created_at timestamptz not null default now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz
);

alter table public.security_alerts enable row level security;

-- Strip any default grants to browser-facing roles; grant only service_role.
revoke all on public.security_alerts from anon, authenticated;
grant all on public.security_alerts to service_role;

-- Fast lookup of the open queue / recent history (GET /security/alerts).
create index if not exists security_alerts_status_created_idx
  on public.security_alerts (status, created_at desc);

-- Defense-in-depth for the dedup contract: at most one open alert per rule_id.
create unique index if not exists security_alerts_open_rule_uidx
  on public.security_alerts (rule_id)
  where status = 'open';

comment on table public.security_alerts is
  'Security monitor alerts (P0-P3). One open row per rule_id (dedup); auto_paused=true when the scan tripped a circuit-breaker.';
