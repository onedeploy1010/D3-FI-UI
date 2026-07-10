/**
 * Configure TREASURY_CRON_SECRET + pg_cron job (every 1 min).
 *
 * Usage:
 *   npm run treasury:setup-cron
 *
 * Requires in .env:
 *   SUPABASE_ACCESS_TOKEN
 * Optional:
 *   TREASURY_CRON_SECRET (generated if missing)
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.resolve(root, '.env');

config({ path: envPath });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
const SUPABASE_URL = process.env.SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

let cronSecret = process.env.TREASURY_CRON_SECRET?.trim();
if (!cronSecret) {
  cronSecret = randomBytes(24).toString('hex');
}

if (!accessToken) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

function upsertEnv(key: string, value: string) {
  let content = '';
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    content = '';
  }

  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + (content.endsWith('\n') || content.length === 0 ? '' : '\n') + line + '\n';
  }
  writeFileSync(envPath, content, 'utf8');
}

async function runSql(query: string): Promise<unknown> {
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
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'd3-treasury-pipeline'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $do$;

SELECT cron.schedule(
  'd3-treasury-pipeline',
  '*/1 * * * *',
  $cron$
  SELECT net.http_post(
    url := '${SUPABASE_URL}/functions/v1/treasury/internal/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Treasury-Cron-Secret', '${cronSecret}'
    ),
    body := '{"maxMonitor":0}'::jsonb
  ) AS request_id;
  $cron$
);
`;

async function invokeTreasury(path: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/treasury${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Treasury-Cron-Secret': cronSecret!,
    },
    body: '{"maxMonitor":0}',
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  console.log('1/4 Setting TREASURY_CRON_SECRET in Supabase Edge secrets...');
  execSync(
    `npx supabase secrets set TREASURY_CRON_SECRET=${cronSecret}`,
    { cwd: root, stdio: 'inherit' },
  );

  console.log('2/4 Writing TREASURY_CRON_SECRET to .env...');
  upsertEnv('TREASURY_CRON_SECRET', cronSecret);

  console.log('3/4 Scheduling pg_cron job (every 1 minute)...');
  await runSql(cronSql);

  console.log('4/4 Running bootstrap + test pipeline...');
  const bootstrap = await invokeTreasury('/admin/bootstrap');
  console.log('   bootstrap:', bootstrap.ok ? 'ok' : bootstrap.json);
  const run = await invokeTreasury('/internal/run');
  console.log('   internal/run:', run.ok ? 'ok' : run.json);

  console.log('');
  console.log('Treasury cron configured.');
  console.log(`  Job name:  d3-treasury-pipeline`);
  console.log(`  Schedule:  every 1 minute (UTC)`);
  console.log(`  Endpoint:  ${SUPABASE_URL}/functions/v1/treasury/internal/run`);
  console.log(`  Secret:    saved to .env as TREASURY_CRON_SECRET`);
  console.log('');
  console.log('Manual test:');
  console.log(`  curl -X POST "${SUPABASE_URL}/functions/v1/treasury/internal/run" \\`);
  console.log(`    -H "X-Treasury-Cron-Secret: $TREASURY_CRON_SECRET"`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
