/**
 * One-click enablement for the D3-FI security monitoring / alerting stack.
 *
 * Usage:
 *   npm run security:enable            # schedule cron + set notifier secrets (if in .env) + test scan
 *   npm run security:enable -- --dry-run
 *
 * What it does (idempotent):
 *   1. Schedules a pg_cron job `d3-security-scan` (every 5 min) that POSTs
 *      /functions/v1/treasury/internal/security-scan with the cron secret.
 *   2. If SECURITY_TELEGRAM_* / SECURITY_SLACK_WEBHOOK_URL are present in .env,
 *      pushes them to Supabase Edge secrets (so the deployed notifier can send).
 *   3. Triggers one scan to verify (tolerates 404 if functions aren't deployed yet).
 *
 * Requires in .env: SUPABASE_URL, SUPABASE_ACCESS_TOKEN, TREASURY_CRON_SECRET.
 * Does NOT deploy edge functions (run `npm run supabase:deploy` yourself — that is a
 * production action best run with your review). Never prints secret values.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.resolve(root, '.env');
const DRY = process.argv.includes('--dry-run');

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  let txt = '';
  try {
    txt = readFileSync(envPath, 'utf8');
  } catch {
    return env;
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const cronSecret = env.TREASURY_CRON_SECRET;

if (!SUPABASE_URL || !accessToken || !cronSecret) {
  console.error('Missing one of SUPABASE_URL / SUPABASE_ACCESS_TOKEN / TREASURY_CRON_SECRET in .env');
  process.exit(1);
}
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

async function runSql(query: string): Promise<unknown> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `SQL API failed (${res.status})`);
  return json;
}

const SCAN_URL = `${SUPABASE_URL}/functions/v1/treasury/internal/security-scan`;
const cronSql = `
DO $do$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'd3-security-scan' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

SELECT cron.schedule(
  'd3-security-scan',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := '${SCAN_URL}',
    headers := jsonb_build_object('Content-Type','application/json','X-Treasury-Cron-Secret','${cronSecret}'),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);`;

async function main() {
  console.log(`D3-FI security monitoring enablement${DRY ? ' (dry-run)' : ''}`);
  console.log('─'.repeat(60));

  console.log('1/3 Schedule pg_cron `d3-security-scan` (every 5 min)');
  if (DRY) {
    console.log(cronSql);
  } else {
    await runSql(cronSql);
    console.log('   ✓ scheduled →', SCAN_URL);
  }

  console.log('2/3 Notifier secrets (Telegram / Slack)');
  const notifierKeys = [
    'SECURITY_TELEGRAM_BOT_TOKEN',
    'SECURITY_TELEGRAM_CHAT_ID',
    'SECURITY_SLACK_WEBHOOK_URL',
    'SECURITY_ALERT_MIN_SEVERITY',
  ].filter((k) => env[k]);
  if (notifierKeys.length === 0) {
    console.log('   ⚠ none configured in .env — alerts will be recorded but NOT pushed.');
    console.log('     Add SECURITY_TELEGRAM_BOT_TOKEN + SECURITY_TELEGRAM_CHAT_ID or SECURITY_SLACK_WEBHOOK_URL, then re-run.');
  } else if (DRY) {
    console.log('   would set edge secrets:', notifierKeys.join(', '));
  } else {
    const args = notifierKeys.map((k) => `${k}=${env[k]}`).join(' ');
    execSync(`npx supabase secrets set ${args}`, { cwd: root, stdio: 'inherit' });
    console.log('   ✓ pushed to edge secrets:', notifierKeys.join(', '));
  }

  console.log('3/3 Trigger one verification scan');
  if (DRY) {
    console.log('   (skipped in dry-run)');
  } else {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Treasury-Cron-Secret': cronSecret },
      body: '{}',
    }).catch((e) => ({ ok: false, status: 0, _err: String(e) }) as unknown as Response);
    const status = (res as Response).status ?? 0;
    if ((res as Response).ok) {
      const j = await (res as Response).json().catch(() => ({}));
      console.log('   ✓ scan ran:', JSON.stringify(j).slice(0, 300));
    } else if (status === 404) {
      console.log('   ⚠ endpoint 404 — edge functions not deployed yet. Run `npm run supabase:deploy`, then the cron will work.');
    } else {
      console.log(`   ⚠ scan returned ${status} — check function deployment / cron secret.`);
    }
  }

  console.log('─'.repeat(60));
  console.log('Done. Remaining manual step(s):');
  console.log('  • Deploy edge functions:  npm run supabase:deploy');
  console.log('  • (optional) Turnkey:     npm run turnkey:policies');
  console.log('  • Grant admins `security.write` in admin_users.permissions to operate circuit breakers.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
