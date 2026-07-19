/**
 * Schedule the 心跳订单 (heartbeat) auto-generator cron. Fires every minute; the
 * treasury `/internal/heartbeat-tick` handler enforces the configured interval
 * (heartbeat.interval_seconds) and the enabled flag, so frequency + start/pause
 * are controlled at runtime from the admin 参数管理 page — no re-scheduling needed.
 *
 * Usage:
 *   npm run heartbeat:setup-cron
 *
 * Requires in .env:
 *   SUPABASE_URL (or default project)
 *   SUPABASE_ACCESS_TOKEN (to schedule pg_cron; without it, test-run only)
 *   TREASURY_CRON_SECRET
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
config({ path: path.resolve(root, '.env') });

// Active project (matches root/.env SUPABASE_URL, the linked CLI project, and CI).
// Override via SUPABASE_PROJECT_REF if the project ever changes.
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'fbykfczfshcmfekdmrfp';
const SUPABASE_URL = process.env.SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const cronSecret = process.env.TREASURY_CRON_SECRET?.trim();

if (!cronSecret) {
  console.error('Missing TREASURY_CRON_SECRET in .env (run npm run treasury:setup-cron first)');
  process.exit(1);
}

async function runSql(query: string): Promise<unknown> {
  if (!accessToken) {
    console.warn('No SUPABASE_ACCESS_TOKEN — skip pg_cron schedule, test-run only.');
    return null;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { message?: string }).message ?? `SQL API failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  return json;
}

const cronSql = `
DO $do$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'd3-heartbeat-tick'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'd3-heartbeat-tick',
  '*/1 * * * *',
  $cron$
  SELECT net.http_post(
    url := '${SUPABASE_URL}/functions/v1/treasury/internal/heartbeat-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Treasury-Cron-Secret', '${cronSecret}'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
`;

async function testRun() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/treasury/internal/heartbeat-tick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Treasury-Cron-Secret': cronSecret!,
    },
    body: '{}',
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  console.log('1/2 Scheduling pg_cron job (every minute; interval enforced in-handler)...');
  await runSql(cronSql);

  console.log('2/2 Test heartbeat tick run...');
  const run = await testRun();
  console.log('   result:', run.ok ? run.json : run);

  console.log('');
  console.log('Heartbeat auto-generator configured.');
  console.log('  Job name:  d3-heartbeat-tick');
  console.log('  Schedule:  */1 * * * * (every minute)');
  console.log(`  Endpoint:  ${SUPABASE_URL}/functions/v1/treasury/internal/heartbeat-tick`);
  console.log('  Frequency / start-pause: heartbeat.* params (admin 参数管理 page).');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
