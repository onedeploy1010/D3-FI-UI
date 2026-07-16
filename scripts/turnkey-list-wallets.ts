/**
 * List all wallets + first account address in the Turnkey org (diagnostic).
 * Usage: npm run turnkey:list-wallets
 * Reads Turnkey creds from supabase/.env.secrets (fallback .env).
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '..', 'supabase', '.env.secrets') });
config({ path: path.resolve(__dirname, '..', '.env') });

const orgId = process.env.TURNKEY_ORGANIZATION_ID?.trim();
const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY?.trim();
const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY?.trim();

if (!orgId || !apiPublicKey || !apiPrivateKey) {
  console.error('Missing TURNKEY_ORGANIZATION_ID / TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY');
  process.exit(1);
}

async function query(pathName: string, body: Record<string, unknown>): Promise<any> {
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey: apiPublicKey!, apiPrivateKey: apiPrivateKey! });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);
  const res = await fetch(`https://api.turnkey.com/public/v1/query/${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
    body: bodyStr,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `${pathName} failed (${res.status})`);
  return json;
}

async function main() {
  const walletsJson = await query('list_wallets', { organizationId: orgId });
  const wallets = walletsJson.wallets ?? [];
  console.log(`Turnkey org ${orgId} — ${wallets.length} wallet(s):\n`);

  for (const w of wallets) {
    let addr = '?';
    try {
      const accts = await query('list_wallet_accounts', {
        organizationId: orgId,
        walletId: w.walletId,
        paginationOptions: { limit: '1' },
      });
      addr = accts.accounts?.[0]?.address ?? '(no account)';
    } catch (e) {
      addr = `(accounts err: ${e instanceof Error ? e.message : e})`;
    }
    console.log(`  • ${w.walletName}`);
    console.log(`    walletId: ${w.walletId}`);
    console.log(`    address:  ${addr}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
