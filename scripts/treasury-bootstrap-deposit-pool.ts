/**
 * One-click pre-build deposit address pool (Turnkey Payment Orchestration).
 *
 * Architecture: single "D3-Deposits" HD wallet + createWalletAccounts per address.
 * See https://docs.turnkey.com/solutions/company-wallets/payment-orchestration
 *
 * Usage:
 *   npm run treasury:bootstrap-pool
 *   npm run treasury:bootstrap-pool -- 100        # target pool size 100
 *   DEPOSIT_POOL_TARGET_SIZE=80 npm run treasury:bootstrap-pool
 *
 * Requires in .env:
 *   SUPABASE_URL
 *   TREASURY_CRON_SECRET
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', '.env') });

const PROJECT_REF = 'gvyvdnegsxiykxffddwb';
const supabaseUrl = process.env.SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;
const cronSecret = process.env.TREASURY_CRON_SECRET;

const targetArg = process.argv[2];
const target = targetArg ? Number(targetArg) : Number(process.env.DEPOSIT_POOL_TARGET_SIZE ?? 50);
const batchSize = Number(process.env.DEPOSIT_POOL_BATCH_SIZE ?? 10);

if (!cronSecret) {
  console.error('Missing TREASURY_CRON_SECRET in .env');
  console.error('Set via: npx supabase secrets set TREASURY_CRON_SECRET=$(openssl rand -hex 24)');
  process.exit(1);
}

if (!Number.isFinite(target) || target <= 0) {
  console.error('Invalid target pool size:', targetArg ?? process.env.DEPOSIT_POOL_TARGET_SIZE);
  process.exit(1);
}

const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/treasury/admin/bootstrap-deposit-pool`;

async function bootstrapBatch(): Promise<{
  created: number;
  available: number;
  target: number;
  addresses: string[];
  depositsHdWalletId?: string | null;
}> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Treasury-Cron-Secret': cronSecret,
    },
    body: JSON.stringify({ target, batchSize }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    created?: number;
    available?: number;
    target?: number;
    addresses?: string[];
    depositsHdWalletId?: string | null;
    architecture?: string;
  };

  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  return {
    created: json.created ?? 0,
    available: json.available ?? 0,
    target: json.target ?? target,
    addresses: json.addresses ?? [],
    depositsHdWalletId: json.depositsHdWalletId ?? null,
  };
}

console.log(`Treasury deposit pool bootstrap (HD accounts)`);
console.log(`  endpoint: ${endpoint}`);
console.log(`  target:   ${target}`);
console.log(`  batch:    ${batchSize}`);
console.log('');

let totalCreated = 0;
let round = 0;

while (true) {
  round++;
  const result = await bootstrapBatch();
  totalCreated += result.created;

  if (result.created > 0) {
    console.log(
      `[${round}] +${result.created} accounts → available ${result.available}/${result.target}` +
        (result.depositsHdWalletId ? ` (hd: ${result.depositsHdWalletId})` : ''),
    );
    for (const addr of result.addresses) {
      console.log(`      ${addr}`);
    }
  } else {
    console.log(`[${round}] pool full — available ${result.available}/${result.target}`);
    break;
  }

  if (result.available >= result.target) break;
}

console.log('');
console.log(`Done. Created ${totalCreated} deposit wallet(s).`);
console.log(`Check: curl ${supabaseUrl.replace(/\/$/, '')}/functions/v1/treasury/health`);
