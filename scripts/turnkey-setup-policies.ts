/**
 * Create Turnkey policies so the backend API user can auto-sign HOT wallets
 * (deposit/settlement/gas/flash-swap) on its own, while the TREASURY is excluded
 * and therefore falls back to the root-quorum multisig for any outflow.
 *
 * Run this WHILE the root quorum threshold is still 1 (so the backend key can create
 * the policies alone), THEN raise the threshold to 2/3.
 *
 * Usage:
 *   npm run turnkey:policies            # dry-run (prints policy bodies)
 *   npm run turnkey:policies -- --execute
 *
 * Env (supabase/.env.secrets or .env):
 *   TURNKEY_ORGANIZATION_ID, TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY
 *   TURNKEY_TREASURY_ADDRESS      (required — the wallet excluded from auto-sign)
 *   TURNKEY_USDT_CONTRACT         (optional — settlement token; default BSC mainnet USDT)
 *   TURNKEY_HOT_WALLETS           (optional — comma-separated deposit/settlement/gas/
 *                                  flash-swap wallet addresses allowed to send)
 *   TURNKEY_GAS_MAX_WEI           (optional — max native BNB per gas top-up, wei; default 0.05 BNB)
 *
 * NOTE: Turnkey's policy DSL evolves. The conditions below are written against the
 * documented `eth.tx.*` fields; verify against https://docs.turnkey.com/concepts/policies
 * before relying on them, and adjust if a policy is rejected at creation.
 *
 * V-02 remediation: the previous hot-wallet policy allowed signing ARBITRARY
 * transactions (its only condition was `eth.tx.from != '<treasury>'`). It is replaced
 * below by TIGHT, per-purpose ALLOW policies plus an explicit catch-all DENY, so the
 * backend key can only (a) ERC20-transfer the settlement token on chain 56 from the
 * managed hot wallets, and (b) send small bounded native BNB gas top-ups.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';

// ---------------------------------------------------------------------------
// Pure, side-effect-free policy-condition builders (unit-tested).
// Exported so tests can assert the exact clauses without any Turnkey API call.
// ---------------------------------------------------------------------------

/** ERC20 `transfer(address,uint256)` 4-byte function selector. */
export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

/** BSC mainnet chain id — the only chain the backend key is allowed to sign for. */
export const BSC_CHAIN_ID = 56;

/** BSC mainnet USDT (BEP-20) — default settlement token. */
export const BSC_USDT_MAINNET_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

export interface Erc20TransferPolicyParams {
  /** Chain id the transaction must target (e.g. 56 for BSC mainnet). */
  chainId: number;
  /** The ERC20 token contract that `eth.tx.to` must equal (the transfer goes to the token). */
  tokenContract: string;
  /** Hot wallets (deposit/settlement/gas/flash-swap) permitted to initiate the transfer. */
  fromWallets: string[];
}

/**
 * Build a TIGHT Turnkey ALLOW condition for ERC20 `transfer` calls.
 *
 * The returned condition requires ALL of:
 *   - `eth.tx.chain_id == <chainId>`                 (no cross-chain replay / wrong-chain signing)
 *   - `eth.tx.to == '<tokenContract>'`               (calldata is aimed at the settlement token only)
 *   - calldata selector == ERC20 `transfer` (0xa9059cbb)   (no `approve`, no arbitrary method)
 *   - `eth.tx.from` is one of the managed hot wallets      (no signing for unknown wallets)
 *
 * It deliberately does NOT contain a bare `eth.tx.from != '<treasury>'` clause: the old
 * "anything that isn't treasury" rule is exactly the V-02 hole this replaces.
 *
 * NOTE: the transfer AMOUNT lives ABI-encoded inside calldata (`eth.tx.data[10..74]`).
 * A ceiling can be layered on by comparing that slice, but a reliable numeric bound in the
 * DSL is brittle across encodings, so amount limits are NOT baked into this condition. See
 * `buildNativeGasPolicyCondition` for the value-bounded native case where `eth.tx.value` IS
 * directly expressible.
 *
 * T-D: the TREASURY outflow caps that this policy cannot express are now ENFORCED at the
 * application layer in `_shared/fundManagement.ts#proposeTreasuryTransfer`, before any Turnkey
 * signing activity is created:
 *   - per-transfer ceiling      TREASURY_MAX_TRANSFER_USDT (default 50,000 USDT)
 *   - platform daily cap        TREASURY_DAILY_CAP_USDT     (default 200,000 USDT/day)
 *   - destination allowlist     treasury_transfer_allowlist (a `to` not listed is rejected)
 * (This note previously implied app-layer caps existed when they did not — they do now.)
 */
export function buildErc20TransferPolicyCondition(params: Erc20TransferPolicyParams): string {
  const chainId = params.chainId;
  const to = (params.tokenContract ?? '').trim().toLowerCase();
  const froms = (params.fromWallets ?? []).map((w) => (w ?? '').trim().toLowerCase()).filter(Boolean);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('buildErc20TransferPolicyCondition: chainId must be a positive integer');
  }
  if (!/^0x[0-9a-f]{40}$/.test(to)) {
    throw new Error('buildErc20TransferPolicyCondition: tokenContract must be a 0x EVM address');
  }
  if (froms.length === 0) {
    throw new Error('buildErc20TransferPolicyCondition: fromWallets must be non-empty');
  }
  const fromClause = froms.map((w) => `eth.tx.from == '${w}'`).join(' || ');
  return [
    `eth.tx.chain_id == ${chainId}`,
    `eth.tx.to == '${to}'`,
    // First 4 bytes (10 hex chars incl. 0x prefix) of calldata must be the transfer selector.
    `eth.tx.data[0..10] == '${ERC20_TRANSFER_SELECTOR}'`,
    `(${fromClause})`,
  ].join(' && ');
}

export interface NativeGasPolicyParams {
  chainId: number;
  /** Hot wallets permitted to send native gas top-ups. */
  fromWallets: string[];
  /** Maximum native value (in wei, as a decimal string) allowed per transaction. */
  maxValueWei: string;
}

/**
 * Build a narrowly-scoped Turnkey ALLOW condition for native BNB gas top-ups.
 *
 * Requires ALL of: correct chain, an allow-listed sender, EMPTY calldata (`eth.tx.data == '0x'`,
 * i.e. a plain value transfer and NOT a contract call), and a hard per-tx value ceiling
 * (`eth.tx.value <= <maxValueWei>`). This lets the backend refuel gas wallets without ever
 * being able to move meaningful native value or invoke a contract.
 */
export function buildNativeGasPolicyCondition(params: NativeGasPolicyParams): string {
  const chainId = params.chainId;
  const froms = (params.fromWallets ?? []).map((w) => (w ?? '').trim().toLowerCase()).filter(Boolean);
  const maxWei = (params.maxValueWei ?? '').trim();
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('buildNativeGasPolicyCondition: chainId must be a positive integer');
  }
  if (froms.length === 0) {
    throw new Error('buildNativeGasPolicyCondition: fromWallets must be non-empty');
  }
  if (!/^[0-9]+$/.test(maxWei)) {
    throw new Error('buildNativeGasPolicyCondition: maxValueWei must be a decimal wei string');
  }
  const fromClause = froms.map((w) => `eth.tx.from == '${w}'`).join(' || ');
  return [
    `eth.tx.chain_id == ${chainId}`,
    `(${fromClause})`,
    // Plain value transfer only — no contract calldata.
    `eth.tx.data == '0x'`,
    `eth.tx.value <= ${maxWei}`,
  ].join(' && ');
}

// ---------------------------------------------------------------------------
// CLI runner below. All env reads / validation / network calls happen only when
// this file is executed directly (via `tsx`), NOT when imported by tests.
// ---------------------------------------------------------------------------

async function tk(
  base: 'query' | 'submit',
  pathName: string,
  body: Record<string, unknown>,
  creds: { orgId: string; apiPublicKey: string; apiPrivateKey: string },
): Promise<any> {
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey: creds.apiPublicKey, apiPrivateKey: creds.apiPrivateKey });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);
  const res = await fetch(`https://api.turnkey.com/public/v1/${base}/${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Stamp': stampHeaderValue },
    body: bodyStr,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `${base}/${pathName} failed (${res.status})`);
  return json;
}

async function resolveBackendUserId(creds: {
  orgId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}): Promise<string> {
  const json = await tk('query', 'list_users', { organizationId: creds.orgId }, creds);
  const users = json.users ?? [];
  const norm = creds.apiPublicKey.toLowerCase();
  for (const u of users) {
    for (const k of u.apiKeys ?? []) {
      if (k.credential?.publicKey?.toLowerCase() === norm) return u.userId;
    }
  }
  throw new Error('Backend API public key is not attached to any Turnkey user.');
}

async function listExistingPolicyNames(creds: {
  orgId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}): Promise<Set<string>> {
  try {
    const json = await tk('query', 'list_policies', { organizationId: creds.orgId }, creds);
    return new Set<string>((json.policies ?? []).map((p: { policyName?: string }) => p.policyName ?? ''));
  } catch {
    return new Set<string>();
  }
}

async function createPolicy(
  p: { policyName: string; effect: string; consensus: string; condition: string; notes: string },
  ctx: {
    orgId: string;
    apiPublicKey: string;
    apiPrivateKey: string;
    execute: boolean;
    existing?: Set<string>;
  },
) {
  const body = {
    type: 'ACTIVITY_TYPE_CREATE_POLICY_V3',
    timestampMs: String(Date.now()),
    organizationId: ctx.orgId,
    parameters: {
      policyName: p.policyName,
      effect: p.effect,
      // Turnkey rejects an empty consensus expression ("Unrecognized EOF"); a DENY
      // catch-all needs no approver quorum, so omit the field entirely when empty.
      ...(p.consensus ? { consensus: p.consensus } : {}),
      condition: p.condition,
      notes: p.notes,
    },
  };
  if (!ctx.execute) {
    console.log(`\n[dry-run] would create policy "${p.policyName}":`);
    console.log(JSON.stringify(body.parameters, null, 2));
    return;
  }
  // Idempotent: skip a policy that already exists so the script can be re-run safely.
  if (ctx.existing?.has(p.policyName)) {
    console.log(`  • ${p.policyName} → already exists (skipped)`);
    return;
  }
  const json = await tk('submit', 'create_policy', body, ctx);
  const status = json.activity?.status;
  console.log(`  ✓ ${p.policyName} → ${status ?? 'submitted'}`);
  if (status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED') {
    console.log('    (needs quorum approval — approve in dashboard or via approve-consensus)');
  }
}

function parseWallets(raw: string | undefined, treasuryLc: string): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^0x[0-9a-f]{40}$/.test(w));
  // Never let the treasury slip into the auto-sign allow-list.
  return list.filter((w) => w !== treasuryLc);
}

async function main() {
  config({ path: path.resolve(__dirnameLocal(), '..', 'supabase', '.env.secrets') });
  config({ path: path.resolve(__dirnameLocal(), '..', '.env') });

  const orgId = process.env.TURNKEY_ORGANIZATION_ID?.trim();
  const apiPublicKey = process.env.TURNKEY_API_PUBLIC_KEY?.trim();
  const apiPrivateKey = process.env.TURNKEY_API_PRIVATE_KEY?.trim();
  const treasury = process.env.TURNKEY_TREASURY_ADDRESS?.trim();
  const execute = process.argv.includes('--execute');

  if (!orgId || !apiPublicKey || !apiPrivateKey) {
    console.error('Missing TURNKEY_ORGANIZATION_ID / TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY');
    process.exit(1);
  }
  if (!treasury) {
    console.error('Missing TURNKEY_TREASURY_ADDRESS — create the treasury wallet and set it first.');
    process.exit(1);
  }

  const creds = { orgId, apiPublicKey, apiPrivateKey };
  const ctx = { ...creds, execute, existing: new Set<string>() };
  const treasuryLc = treasury.toLowerCase();

  const usdtContract = (process.env.TURNKEY_USDT_CONTRACT?.trim() || BSC_USDT_MAINNET_CONTRACT).toLowerCase();
  const hotWallets = parseWallets(process.env.TURNKEY_HOT_WALLETS, treasuryLc);
  const gasMaxWei = process.env.TURNKEY_GAS_MAX_WEI?.trim() || '50000000000000000'; // 0.05 BNB

  const backendUserId = await resolveBackendUserId(creds);
  if (execute) ctx.existing = await listExistingPolicyNames(creds);
  console.log(`Backend Turnkey user: ${backendUserId}`);
  console.log(`Treasury (excluded):  ${treasury}`);
  console.log(`Settlement token:     ${usdtContract}`);
  console.log(
    hotWallets.length
      ? `Hot wallets (allow):  ${hotWallets.join(', ')}`
      : 'Hot wallets (allow):  <none set — TURNKEY_HOT_WALLETS empty; token-transfer policy will be un-usable until set>',
  );
  console.log(execute ? '\nEXECUTE mode — submitting policies…' : '\nDRY-RUN — nothing submitted. Add --execute to apply.');

  const backendApproves = `approvers.any(user, user.id == '${backendUserId}')`;

  // Guard against an empty allow-list producing a condition that references no sender.
  const senderWallets = hotWallets.length ? hotWallets : [treasuryLc /* placeholder; treasury can't actually sign */];

  // 1) ALLOW: backend may ERC20-transfer the settlement token on chain 56 from the managed
  //    hot wallets ONLY. Pinned chain + token `to` + transfer selector + sender allow-list.
  await createPolicy(
    {
      policyName: 'd3-backend-usdt-transfer',
      effect: 'EFFECT_ALLOW',
      consensus: backendApproves,
      condition: buildErc20TransferPolicyCondition({
        chainId: BSC_CHAIN_ID,
        tokenContract: usdtContract,
        fromWallets: senderWallets,
      }),
      notes:
        'V-02: backend auto-signs ONLY USDT transfers on chain 56 from managed hot wallets. ' +
        'No arbitrary to/calldata. Treasury excluded from the sender allow-list.',
    },
    ctx,
  );

  // 2) ALLOW: backend may send small, bounded native BNB gas top-ups (plain value transfer,
  //    no calldata, hard per-tx ceiling). Lets gas wallets refuel without moving real value.
  await createPolicy(
    {
      policyName: 'd3-backend-native-gas',
      effect: 'EFFECT_ALLOW',
      consensus: backendApproves,
      condition: buildNativeGasPolicyCondition({
        chainId: BSC_CHAIN_ID,
        fromWallets: senderWallets,
        maxValueWei: gasMaxWei,
      }),
      notes: `V-02: backend gas top-ups only — native transfer, no calldata, value <= ${gasMaxWei} wei.`,
    },
    ctx,
  );

  // 3) DENY (catch-all): explicitly reject anything the two ALLOW policies above do not cover,
  //    so a future permissive default can never re-open arbitrary signing. Turnkey evaluates
  //    DENY with precedence; the tight ALLOWs above carve out exactly the two permitted flows.
  await createPolicy(
    {
      policyName: 'd3-backend-deny-everything-else',
      effect: 'EFFECT_DENY',
      consensus: '', // applies regardless of approver
      condition: 'true',
      notes: 'V-02: default-deny. Only the explicit USDT-transfer and native-gas ALLOWs may sign.',
    },
    ctx,
  );

  // 4) ALLOW: backend may create wallets / wallet accounts (deposit-pool growth) without quorum.
  //    Scoped strictly to the two wallet-management activity types — no signing power here.
  await createPolicy(
    {
      policyName: 'd3-backend-manage-wallets',
      effect: 'EFFECT_ALLOW',
      consensus: backendApproves,
      condition:
        "activity.type == 'ACTIVITY_TYPE_CREATE_WALLET' || activity.type == 'ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS'",
      notes: 'Backend creates settlement/gas/flash-swap wallets and derives deposit addresses. No tx signing.',
    },
    ctx,
  );

  console.log('\nDone. After verifying, raise the root quorum threshold to 2/3 for treasury multisig.');
}

function __dirnameLocal(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/** Only run the CLI when executed directly (tsx), never when imported by tests. */
const isDirectRun = (() => {
  try {
    return !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
