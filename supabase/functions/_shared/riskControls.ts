import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';
import { computeSolvency as realComputeSolvency } from './solvency.ts';

type Sb = SupabaseClient;

/** Withdrawal statuses that reserve real USDT and therefore count toward caps. */
const ACTIVE_WITHDRAWAL_STATUSES = ['pending', 'signing', 'broadcasted', 'confirmed'] as const;

/** Fallback caps used only if the risk_limits singleton row is missing. */
const DEFAULT_LIMITS = {
  max_withdraw_per_tx_usdt: 2000,
  max_user_daily_usdt: 5000,
  max_platform_hourly_usdt: 50000,
  min_solvency_ratio: 1.0,
};

type RiskLimits = {
  max_withdraw_per_tx_usdt: number;
  max_user_daily_usdt: number;
  max_platform_hourly_usdt: number;
  min_solvency_ratio: number;
};

/** Injectable solvency computation so tests can stub it without chain calls. */
export type RiskDeps = {
  computeSolvency: (sb: Sb) => Promise<{ ratio: number }>;
};

const DEFAULT_DEPS: RiskDeps = { computeSolvency: realComputeSolvency };

/**
 * Throw HttpError(503) if the named circuit-breaker in system_pause_flags is
 * engaged. Reusable across surfaces (flash_swap, deposits, settlement, ...).
 */
export async function assertNotPaused(sb: Sb, flag: string): Promise<void> {
  const { data, error } = await sb
    .from('system_pause_flags')
    .select('paused')
    .eq('flag', flag)
    .maybeSingle();
  if (error) throw error;
  if (data?.paused) {
    throw new HttpError(503, 'Flash-swap temporarily paused');
  }
}

async function loadLimits(sb: Sb): Promise<RiskLimits> {
  const { data, error } = await sb
    .from('risk_limits')
    .select('max_withdraw_per_tx_usdt, max_user_daily_usdt, max_platform_hourly_usdt, min_solvency_ratio')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as Partial<RiskLimits>;
  return {
    max_withdraw_per_tx_usdt: Number(row.max_withdraw_per_tx_usdt ?? DEFAULT_LIMITS.max_withdraw_per_tx_usdt),
    max_user_daily_usdt: Number(row.max_user_daily_usdt ?? DEFAULT_LIMITS.max_user_daily_usdt),
    max_platform_hourly_usdt: Number(row.max_platform_hourly_usdt ?? DEFAULT_LIMITS.max_platform_hourly_usdt),
    min_solvency_ratio: Number(row.min_solvency_ratio ?? DEFAULT_LIMITS.min_solvency_ratio),
  };
}

/** Sum net_amount_usdt of active withdrawals since `sinceIso`, optionally scoped to one wallet. */
async function sumWithdrawals(sb: Sb, sinceIso: string, walletAddress?: string): Promise<number> {
  let q = sb
    .from('partner_yield_withdrawals')
    .select('net_amount_usdt')
    .gte('created_at', sinceIso)
    .in('status', ACTIVE_WITHDRAWAL_STATUSES as unknown as string[]);
  if (walletAddress) q = q.eq('wallet_address', walletAddress);
  const { data, error } = await q;
  if (error) throw error;
  let total = 0;
  for (const r of (data ?? []) as Array<{ net_amount_usdt?: unknown }>) {
    total += Number(r.net_amount_usdt ?? 0);
  }
  return total;
}

/**
 * Enforce every flash-swap withdrawal risk control BEFORE any balance is debited.
 * Throws HttpError on the first guard that trips; resolves silently when clear.
 *
 * Guards, in order:
 *   1. flash_swap pause flag          -> 503
 *   2. per-transaction cap            -> 400
 *   3. per-wallet 24h cumulative cap  -> 429
 *   4. platform-wide 1h cumulative cap-> 503
 *   5. solvency ratio floor           -> 503
 *
 * Solvency fail-safe policy: if the solvency report cannot be computed at all
 * (computeSolvency throws) we BLOCK (503) — never pay out when solvency is
 * unknown. If the report IS computed but reports no measurable liability
 * (ratio sentinel -1 / non-finite), we ALLOW, since there is nothing to be
 * insolvent against. Only a finite ratio below min_solvency_ratio blocks.
 */
export async function assertWithdrawAllowed(
  sb: Sb,
  { walletAddress, amountUsdt }: { walletAddress: string; amountUsdt: number },
  deps: RiskDeps = DEFAULT_DEPS,
): Promise<void> {
  // 1. Global circuit-breaker for the flash-swap surface.
  await assertNotPaused(sb, 'flash_swap');

  const limits = await loadLimits(sb);

  // 2. Per-transaction hard cap.
  if (amountUsdt > limits.max_withdraw_per_tx_usdt) {
    throw new HttpError(400, 'Exceeds per-transaction limit');
  }

  // 3. Per-wallet rolling 24h cap.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const userDaily = await sumWithdrawals(sb, dayAgo, walletAddress);
  if (userDaily + amountUsdt > limits.max_user_daily_usdt) {
    throw new HttpError(429, 'Exceeds daily withdrawal limit');
  }

  // 4. Platform-wide rolling 1h cap.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const platformHourly = await sumWithdrawals(sb, hourAgo);
  if (platformHourly + amountUsdt > limits.max_platform_hourly_usdt) {
    throw new HttpError(503, 'Platform hourly withdrawal limit reached');
  }

  // 5. Solvency floor. Fail-safe: block if we cannot compute at all.
  let ratio: number;
  try {
    const report = await deps.computeSolvency(sb);
    ratio = Number(report?.ratio);
  } catch {
    throw new HttpError(503, 'Solvency guard: withdrawals paused');
  }
  // ratio === -1 is the "no liability / infinite coverage" sentinel from
  // computeSolvency; non-finite values mean nothing to measure -> allow.
  if (Number.isFinite(ratio) && ratio >= 0 && ratio < limits.min_solvency_ratio) {
    throw new HttpError(503, 'Solvency guard: withdrawals paused');
  }
}
