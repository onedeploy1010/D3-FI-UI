import { HttpError } from './wallet.ts';

/** BSC mainnet USDT (BEP-20) */
export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_NAME = 'bsc';
export const BSC_USDT_SYMBOL = 'USDT';
export const BSC_USDT_MAINNET_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
/**
 * Settlement token. Defaults to real BSC USDT; override with BSC_USDT_CONTRACT to
 * point the whole deposit/monitor/sweep/verify pipeline at a fake token (staging).
 */
export const BSC_USDT_CONTRACT =
  Deno.env.get('BSC_USDT_CONTRACT')?.trim() || BSC_USDT_MAINNET_CONTRACT;
export const BSC_USDT_DECIMALS = 18;

/** Minimum confirmations before crediting (BSC). */
export const BSC_MIN_CONFIRMATIONS = 12;

/** Deposit intent TTL. */
export const DEPOSIT_INTENT_TTL_HOURS = 24;

/**
 * Chain IDs we treat as testnets, where wiring a faucet / TestUSDT token into the
 * settlement pipeline is acceptable (staging/demo). Mainnet BSC (56) is NOT here —
 * on mainnet only the canonical USDT contract may ever be used for accounting.
 */
export const KNOWN_TESTNET_CHAIN_IDS: readonly number[] = [97]; // 97 = BSC testnet (Chapel)

/**
 * V-20 guard (pure): is it safe to use `contract` as the settlement token on `chainId`?
 *
 * Returns true ONLY when either:
 *   - `contract` is the canonical BSC mainnet USDT (safe on any chain), OR
 *   - `chainId` is a known testnet AND `allowFlag` is explicitly set (faucet token opt-in).
 *
 * Any other combination (e.g. a fake/faucet token on mainnet chain 56, or a faucet token
 * on a testnet without the opt-in flag) is considered UNSAFE for production accounting.
 */
export function isFaucetTokenAllowed(contract: string, chainId: number, allowFlag: boolean): boolean {
  const normalized = (contract ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === BSC_USDT_MAINNET_CONTRACT.toLowerCase()) return true;
  if (KNOWN_TESTNET_CHAIN_IDS.includes(chainId) && allowFlag === true) return true;
  return false;
}

/**
 * V-20 guard: assert the RESOLVED settlement token is safe before any money route runs.
 * Called by the treasury router (Agent A) ahead of deposit/settlement/withdraw flows.
 *
 * Rule (matching `isFaucetTokenAllowed`):
 *   - canonical mainnet USDT → always OK;
 *   - a non-canonical (faucet/test) token is OK ONLY when BOTH the resolved chain is a
 *     known testnet AND `ALLOW_FAUCET_TOKEN === 'true'`. On mainnet chain 56 a faucet
 *     token is NEVER allowed, even with the flag set.
 *
 * The chain id is resolved from `BSC_CHAIN_ID` env override (default 56) so a staging
 * deployment can legitimately point at testnet + a faucet token.
 *
 * Throws HttpError(503) on misconfig. NOT evaluated at import time (would break
 * demo/staging startup) — only when this function is invoked.
 */
export function assertSettlementTokenSafe(): void {
  const allowFlag = Deno.env.get('ALLOW_FAUCET_TOKEN')?.trim() === 'true';
  const chainId = Number(Deno.env.get('BSC_CHAIN_ID')?.trim() || String(BSC_CHAIN_ID));

  if (isFaucetTokenAllowed(BSC_USDT_CONTRACT, chainId, allowFlag)) return;

  // ── MAINNET STAGING OVERRIDE (explicit, dangerous, off by default) ──
  // Deliberate escape hatch for a mainnet test phase with a fake/faucet token:
  // all data is disposable and the token + binding/other contracts WILL be wiped
  // and redeployed before go-live. This bypasses the V-20 mainnet guard, so it must
  // stay UNSET in production. Loud warning on every money route so it can't hide.
  if (Deno.env.get('ALLOW_MAINNET_FAUCET_TOKEN')?.trim() === 'true') {
    console.warn(
      `[V-20 OVERRIDE] MAINNET STAGING: settlement token ${BSC_USDT_CONTRACT} on chain ${chainId} ` +
        `is NOT canonical USDT. Test-phase only — data is disposable. Remove ALLOW_MAINNET_FAUCET_TOKEN before production.`,
    );
    return;
  }

  throw new HttpError(
    503,
    `Settlement token misconfigured: BSC_USDT_CONTRACT=${BSC_USDT_CONTRACT} is not the canonical ` +
      `BSC mainnet USDT (${BSC_USDT_MAINNET_CONTRACT}) and faucet tokens are not permitted on ` +
      `chain ${chainId}. Set BSC_USDT_CONTRACT to real USDT for production, or run on a known ` +
      `testnet (chain ${KNOWN_TESTNET_CHAIN_IDS.join('/')}) with ALLOW_FAUCET_TOKEN=true for staging.`,
    { code: 'SETTLEMENT_TOKEN_MISCONFIGURED', contract: BSC_USDT_CONTRACT, chainId },
  );
}
