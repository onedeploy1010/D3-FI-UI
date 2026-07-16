/**
 * Create a single EVM wallet in the Turnkey org and print its walletId + address.
 * Usage: npm run turnkey:create-wallet -- D3-Treasury
 * Reads creds from supabase/.env.secrets (fallback .env).
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
const walletName = (process.argv[2] || 'D3-Treasury').slice(0, 64);

if (!orgId || !apiPublicKey || !apiPrivateKey) {
  console.error('Missing TURNKEY_ORGANIZATION_ID / TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY');
  process.exit(1);
}

async function main() {
  const body = {
    type: 'ACTIVITY_TYPE_CREATE_WALLET',
    organizationId: orgId,
    parameters: {
      walletName,
      accounts: [
        {
          curve: 'CURVE_SECP256K1',
          pathFormat: 'PATH_FORMAT_BIP32',
          addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
          path: "m/44'/60'/0'/0/0",
        },
      ],
    },
    timestampMs: String(Date.now()),
  };
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey: apiPublicKey!, apiPrivateKey: apiPrivateKey! });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);

  const res = await fetch('https://api.turnkey.com/public/v1/submit/create_wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
    body: bodyStr,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `create_wallet failed (${res.status})`);

  const activity = json.activity;
  const status = activity?.status;
  const result = activity?.result?.createWalletResult;
  const walletId = result?.walletId;
  const address = result?.addresses?.[0];

  if (status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED') {
    console.log(`Wallet "${walletName}" creation needs quorum approval (CONSENSUS_NEEDED).`);
    console.log('Approve in the Turnkey dashboard, then re-check.');
    return;
  }
  if (!walletId || !address) {
    console.error('Unexpected response:', JSON.stringify(json).slice(0, 800));
    process.exit(1);
  }

  console.log(`Created wallet "${walletName}":`);
  console.log(`  walletId: ${walletId}`);
  console.log(`  address:  ${address}`);
  console.log('');
  console.log('Set as treasury (if this is D3-Treasury):');
  console.log(`  npx supabase secrets set TURNKEY_TREASURY_ADDRESS=${address} TURNKEY_TREASURY_WALLET_ID=${walletId} --project-ref fbykfczfshcmfekdmrfp`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
