/**
 * Schedule / test demo partner daily tick (new downline + settle prior pending UD3).
 * Also runs automatically after `partner-settlement/run` each night.
 *
 * Usage:
 *   npm run partner:demo-tick
 *
 * Requires in .env:
 *   SUPABASE_URL (or default project)
 *   TREASURY_CRON_SECRET
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
config({ path: path.resolve(root, '.env') });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
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
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'd3-partner-demo-daily-tick'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'd3-partner-demo-daily-tick',
  '5 16 * * *',
  $cron$
  SELECT net.http_post(
    url := '${SUPABASE_URL}/functions/v1/treasury/internal/partner-demo-tick',
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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/treasury/internal/partner-demo-tick`, {
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
  console.log('1/2 Scheduling pg_cron job (00:05 Singapore / UTC 16:05)...');
  await runSql(cronSql);

  console.log('2/2 Test demo tick run...');
  const run = await testRun();
  console.log('   result:', run.ok ? run.json : run);

  console.log('');
  console.log('Demo partner daily tick configured.');
  console.log('  Job name:  d3-partner-demo-daily-tick');
  console.log('  Schedule:  5 16 * * * (UTC) = 00:05 Asia/Singapore');
  console.log(`  Endpoint:  ${SUPABASE_URL}/functions/v1/treasury/internal/partner-demo-tick`);
  console.log('  Also runs after nightly partner-settlement.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
