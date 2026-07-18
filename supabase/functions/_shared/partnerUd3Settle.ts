/**
 * Allocate UD3 when a USDT stake intent is credited
 * (partner_join / crowdfund_stake — not SD3 re-stake).
 *
 * v2: the reward split is computed by the versioned, exact-Decimal calculator
 * (_shared/ud3Reward.ts + ud3RewardConfig.ts). This module only resolves the
 * on-chain/DB context (referrer 档位 + upline chain), hands a fully-materialised
 * input to the calculator, then persists an audited snapshot (GUIDE_REWARD /
 * NETWORK_DIFFERENCE_REWARD / BURN rows) and credits the winners' pending_ud3.
 *
 * Money is NEVER a JS Number: every amount is a Decimal and is written to the
 * numeric columns / RPCs as a fixed-6 decimal STRING so full precision survives.
 *
 * Idempotency: the calculator's deterministic idempotency_key is a unique index on
 * partner_ud3_ledger, so a re-run that races past the intent_id short-circuit hits a
 * 23505 on the row insert — we skip that row and do NOT re-credit it.
 *
 * Call after rollupPartnerPerformance so 引路人 total perf includes the new volume.
 */
import Decimal from 'npm:decimal.js@10';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  getUd3Tier,
  resolveUd3SLevel,
  type Ud3UplineNode,
} from './partnerUd3Rules.ts';
import {
  calculateUd3RewardDistribution,
  ud3RewardIdempotencyKey,
  type CalculateUd3RewardInput,
} from './ud3Reward.ts';
import {
  getUd3RewardConfig,
  guideLevelRateFor,
  networkCumulativeRateFor,
} from './ud3RewardConfig.ts';
import { sumReferralTreePerformance } from './partnerPerformance.ts';
import { toSgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

const UD3_STAKE_INTENT_TYPES = new Set(['partner_join', 'crowdfund_stake']);
const BURN_SINK = 'burn:ud3';

/** Fixed-6 decimal string for numeric columns / RPC params (never a JS Number). */
function f6(value: Decimal): string {
  return value.toFixed(6);
}

function parseSLevelId(label?: string | null): number | null {
  if (!label) return null;
  const m = /^[SVs]?(\d+)$/.exec(label.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 6 ? n : null;
}

async function cacheAccountLevels(
  sb: Sb,
  wallet: string,
  teamPerfUsdt: number,
): Promise<void> {
  const tier = getUd3Tier(teamPerfUsdt);
  const level = resolveUd3SLevel({ totalPerfUsdt: teamPerfUsdt, smallAreaPerfUsdt: 0 });
  await sb.from('partner_accounts').upsert(
    {
      wallet_address: wallet,
      ud3_tier_id: tier?.id ?? null,
      ud3_v_level: level?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' },
  );
}

async function fetchUplineChainAbove(sb: Sb, referrerWallet: string): Promise<Ud3UplineNode[]> {
  const chain: Ud3UplineNode[] = [];
  let current = referrerWallet;
  const seen = new Set<string>([referrerWallet.trim().toLowerCase()]);

  for (let depth = 0; depth < 32; depth++) {
    const { data: ref } = await sb
      .from('referrals')
      .select('sponsor_wallet_address')
      .ilike('wallet_address', current)
      .eq('referral_type', 'partner')
      .eq('status', 'active')
      .maybeSingle();

    const sponsor = (ref?.sponsor_wallet_address as string | undefined)?.trim();
    if (!sponsor) break;
    const key = sponsor.toLowerCase();
    if (seen.has(key)) break;
    seen.add(key);

    const teamPerf = await sumReferralTreePerformance(sb, sponsor);
    const level = resolveUd3SLevel({ totalPerfUsdt: teamPerf, smallAreaPerfUsdt: 0 });
    chain.push({
      wallet: sponsor,
      vSharePct: level?.sharePct ?? 0,
      vLabel: level?.label,
    });
    await cacheAccountLevels(sb, sponsor, teamPerf).catch(() => {});

    current = sponsor;
  }

  return chain;
}

/** Credits UD3 for a deposit using referrer 档位 + network 级差. Idempotent on intent_id. */
export async function allocateUd3ForCreditedIntent(
  sb: Sb,
  input: {
    intentId: string;
    depositorWallet: string;
    referrerWallet: string;
    depositUsdt: number;
    referrerTotalPerfUsdt: number;
  },
): Promise<{ ok: boolean; skipped?: boolean; eventId?: string }> {
  if (!Number.isFinite(input.depositUsdt) || input.depositUsdt <= 0) {
    return { ok: true, skipped: true };
  }

  // Primary idempotency: an event for this intent already settled → nothing to do.
  const { data: existing } = await sb
    .from('partner_ud3_events')
    .select('id')
    .eq('intent_id', input.intentId)
    .maybeSingle();
  if (existing) return { ok: true, skipped: true, eventId: existing.id as string };

  await cacheAccountLevels(sb, input.referrerWallet, input.referrerTotalPerfUsdt).catch(() => {});

  const networkChain = await fetchUplineChainAbove(sb, input.referrerWallet);

  // ── Build the calculator input (config-versioned, Decimal, single source) ───
  const config = getUd3RewardConfig();
  const version = config.version;

  const guideTier = getUd3Tier(input.referrerTotalPerfUsdt);
  const guideLevel = guideTier?.label ?? null;
  const guideLevelRate = guideLevelRateFor(guideLevel, config);

  // Include ALL uplines above the referrer (even same/lower level) so NO_DIFFERENCE
  // rows are recorded for audit. Cumulative rates come from ud3RewardConfig ONLY.
  const networkAncestors = networkChain.map((node, i) => {
    const level = node.vLabel ?? 'S0';
    return {
      userId: node.wallet,
      relationDepth: i + 1,
      level,
      cumulativeRate: networkCumulativeRateFor(level, config),
    };
  });

  const rewardInput: CalculateUd3RewardInput = {
    orderId: input.intentId,
    principalAmount: new Decimal(input.depositUsdt),
    bribeRate: config.bribeRate,
    guideUserId: input.referrerWallet,
    guideLevel,
    guideLevelRate,
    networkAncestors,
    levelConfigVersion: version,
  };

  const dist = calculateUd3RewardDistribution(rewardInput);

  if (dist.totalBribeAmount.lte(0)) {
    return { ok: true, skipped: true };
  }

  // Conservation invariant (defence-in-depth; the calculator also asserts this).
  const conserved = dist.guideReward.rewardAmount
    .plus(dist.networkRewardTotal)
    .plus(dist.burnAmount);
  if (!conserved.equals(dist.totalBribeAmount)) {
    console.error(
      `[ud3] conservation violated for ${input.intentId}: ${conserved.toString()} != ${dist.totalBribeAmount.toString()}`,
    );
    return { ok: false };
  }

  // ── Event snapshot (legacy columns kept for existing readers) ──────────────
  const { data: event, error: eventErr } = await sb
    .from('partner_ud3_events')
    .insert({
      intent_id: input.intentId,
      depositor_wallet: input.depositorWallet,
      referrer_wallet: input.referrerWallet,
      deposit_usdt: f6(dist.principalAmount),
      referrer_total_perf_usdt: input.referrerTotalPerfUsdt,
      tier_id: guideTier?.id ?? null,
      tier_rate_pct: guideTier?.ratePct ?? 0,
      generated_ud3: f6(dist.totalBribeAmount),
      direct_ud3: f6(dist.guideReward.rewardAmount),
      network_pool_ud3: f6(dist.networkBasePool),
      network_allocated_ud3: f6(dist.networkRewardTotal),
      network_remaining_ud3: f6(dist.burnAmount),
    })
    .select('id')
    .single();

  if (eventErr || !event) {
    console.error('[ud3] event insert:', eventErr?.message);
    return { ok: false };
  }

  const eventId = event.id as string;
  const nowIso = new Date().toISOString();

  // Winners to credit, keyed by lowercased wallet. Only rows whose ledger insert
  // actually succeeds (no 23505 replay) are added — that's what makes retries safe.
  const creditMap = new Map<string, Decimal>();
  const addCredit = (wallet: string, amount: Decimal) => {
    if (amount.lte(0)) return;
    const k = wallet.trim().toLowerCase();
    creditMap.set(k, (creditMap.get(k) ?? new Decimal(0)).plus(amount));
  };

  const baseSnapshot = {
    event_id: eventId,
    principal_amount: f6(dist.principalAmount),
    total_bribe_amount: f6(dist.totalBribeAmount),
    network_base_pool: f6(dist.networkBasePool),
    level_config_version: version,
    calculated_at: nowIso,
  };

  // ① 引路人 GUIDE_REWARD row.
  const guideAmount = dist.guideReward.rewardAmount;
  const guideStatus = await insertLedgerRow(sb, {
    ...baseSnapshot,
    recipient_wallet: input.referrerWallet,
    role: 'direct',
    reward_type: 'GUIDE_REWARD',
    reward_status: guideAmount.gt(0) ? 'CREDITED' : 'NO_DIFFERENCE',
    beneficiary_level: guideLevel,
    guide_level_rate: f6(dist.guideReward.levelRate),
    v_level: guideTier?.id ?? null,
    v_share_pct: null,
    gap_pct: null,
    ud3_amount: f6(guideAmount),
    idempotency_key: ud3RewardIdempotencyKey(input.intentId, input.referrerWallet, 'GUIDE_REWARD', version),
    settled: false,
  });
  if (guideStatus === 'inserted' && guideAmount.gt(0)) {
    addCredit(input.referrerWallet, guideAmount);
  }

  // ② 网体 NETWORK_DIFFERENCE_REWARD rows — one per ancestor, incl. NO_DIFFERENCE.
  for (const nr of dist.networkRewards) {
    const rewarded = nr.rewardStatus === 'REWARDED';
    const st = await insertLedgerRow(sb, {
      ...baseSnapshot,
      recipient_wallet: nr.userId,
      role: 'differential',
      reward_type: 'NETWORK_DIFFERENCE_REWARD',
      reward_status: rewarded ? 'CREDITED' : 'NO_DIFFERENCE',
      relation_depth: nr.relationDepth,
      beneficiary_level: nr.level,
      cumulative_rate: f6(nr.cumulativeRate),
      previous_released_rate: f6(nr.previousReleasedRate),
      difference_rate: f6(nr.differenceRate),
      v_level: parseSLevelId(nr.level),
      v_share_pct: f6(nr.cumulativeRate.times(100)),
      gap_pct: f6(nr.differenceRate.times(100)),
      ud3_amount: f6(nr.rewardAmount),
      idempotency_key: ud3RewardIdempotencyKey(input.intentId, nr.userId, 'NETWORK_DIFFERENCE_REWARD', version),
      settled: false,
    });
    if (st === 'inserted' && rewarded) {
      addCredit(nr.userId, nr.rewardAmount);
    }
  }

  // ③ BURN row — absorbs the unreleased tail. No recipient account, informational.
  await insertLedgerRow(sb, {
    ...baseSnapshot,
    recipient_wallet: BURN_SINK,
    role: 'reserve',
    reward_type: 'BURN',
    reward_status: 'CALCULATED',
    v_level: null,
    v_share_pct: null,
    gap_pct: null,
    ud3_amount: f6(dist.burnAmount),
    idempotency_key: ud3RewardIdempotencyKey(input.intentId, BURN_SINK, 'BURN', version),
    settled: true,
  });

  await sb.from('partner_ud3_calc_logs').insert({
    event_id: eventId,
    kind: 'settle',
    input: {
      depositUsdt: input.depositUsdt,
      referrerWallet: input.referrerWallet,
      referrerTotalPerfUsdt: input.referrerTotalPerfUsdt,
      guideLevel,
      networkChain,
      configVersion: version,
    },
    output: dist,
  });

  // Credit each winner's pending_ud3 (amounts as fixed-6 decimal strings).
  for (const [walletLower, amount] of creditMap) {
    if (amount.lte(0)) continue;
    await creditPendingUd3Reward(sb, walletLower, f6(amount));
  }

  // Immediate settlement: move pending_ud3 → ud3_balance now and flip this event's
  // rows to settled. The daily SGT-midnight run remains a retry safety net.
  await settleEventImmediately(sb, eventId, [...creditMap.keys()]);

  return { ok: true, eventId };
}

/**
 * Insert one ledger row. Returns 'inserted' on success, 'duplicate' on the
 * idempotency 23505 conflict (retry replay — caller must NOT re-credit), or 'error'.
 */
async function insertLedgerRow(
  sb: Sb,
  row: Record<string, unknown>,
): Promise<'inserted' | 'duplicate' | 'error'> {
  const { error } = await sb.from('partner_ud3_ledger').insert(row);
  if (!error) return 'inserted';
  const code = (error as { code?: string }).code;
  const msg = (error as { message?: string }).message ?? '';
  if (code === '23505' || msg.includes('duplicate key')) return 'duplicate';
  console.error('[ud3] ledger insert:', msg);
  return 'error';
}

/**
 * Settle the rewards of a single UD3 event right away (immediate-settlement mode).
 * Moves pending_ud3 → ud3_balance for each recipient and marks their ledger rows
 * for this event as settled. Best-effort per wallet: a failed settle leaves that
 * wallet's rows unsettled for the daily-run retry.
 */
async function settleEventImmediately(
  sb: Sb,
  eventId: string,
  recipientWalletsLower: string[],
): Promise<void> {
  if (recipientWalletsLower.length === 0) return;
  const settlementDate = toSgtDateString();
  const nowIso = new Date().toISOString();
  const settledWallets: string[] = [];
  for (const walletLower of recipientWalletsLower) {
    const { error: settleErr } = await sb.rpc('settle_pending_ud3', { p_wallet: walletLower });
    if (settleErr) {
      console.error('[ud3] immediate settle_pending_ud3:', settleErr.message);
      continue;
    }
    settledWallets.push(walletLower);
  }
  if (settledWallets.length === 0) return;

  const flip = { settled: true, settled_at: nowIso, settlement_date: settlementDate, credited_at: nowIso };
  if (settledWallets.length === recipientWalletsLower.length) {
    // All recipients settled — flip every still-unsettled row of this event in one shot.
    const { error } = await sb
      .from('partner_ud3_ledger')
      .update(flip)
      .eq('event_id', eventId)
      .eq('settled', false);
    if (error) console.error('[ud3] immediate ledger flip:', error.message);
    return;
  }
  // Partial success — flip only the settled wallets' rows (case-insensitive match).
  for (const walletLower of settledWallets) {
    const { error } = await sb
      .from('partner_ud3_ledger')
      .update(flip)
      .eq('event_id', eventId)
      .eq('settled', false)
      .ilike('recipient_wallet', walletLower);
    if (error) console.error('[ud3] immediate ledger flip (partial):', error.message);
  }
}

/**
 * Accrue a UD3 reward to the recipient's PENDING (unsettled) bucket atomically.
 *
 * Two-phase settlement (043): generation credits `pending_ud3` only via the atomic
 * `credit_pending_ud3` RPC (single UPDATE ... += under a row lock, case-insensitive).
 * `amount` is a fixed-6 decimal STRING so the numeric column keeps full precision.
 *
 * Credit-first, provision-on-not-found: only a genuinely absent account triggers a
 * row insert + single retry.
 */
async function creditPendingUd3Reward(sb: Sb, walletLower: string, amount: string): Promise<void> {
  const { error: creditErr } = await sb.rpc('credit_pending_ud3', {
    p_wallet: walletLower,
    p_amount: amount,
  });
  if (!creditErr) return;

  const msg = creditErr.message ?? '';
  if (msg.includes('ACCOUNT_NOT_FOUND') || msg.includes('RECIPIENT_NOT_FOUND')) {
    await sb.from('partner_accounts').upsert(
      { wallet_address: walletLower },
      { onConflict: 'wallet_address', ignoreDuplicates: true },
    );
    const { error: retryErr } = await sb.rpc('credit_pending_ud3', {
      p_wallet: walletLower,
      p_amount: amount,
    });
    if (retryErr) console.error('[ud3] credit_pending_ud3 retry:', retryErr.message);
    return;
  }
  console.error('[ud3] credit_pending_ud3:', creditErr.message);
}

/**
 * Full credit-path entry: resolve 引路人 + tier perf, then settle UD3.
 * Safe to call from every deposit credit path; no-ops when ineligible.
 */
export async function tryAllocateUd3ForCreditedIntent(
  sb: Sb,
  intentId: string,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string; eventId?: string }> {
  const { data: intent, error } = await sb
    .from('stake_intents')
    .select('id, wallet_address, intent_type, amount_usdt, status')
    .eq('id', intentId)
    .maybeSingle();
  if (error || !intent) return { ok: false, reason: 'intent_missing' };

  const intentType = String(intent.intent_type ?? '');
  if (!UD3_STAKE_INTENT_TYPES.has(intentType)) {
    return { ok: true, skipped: true, reason: 'intent_type_excluded' };
  }

  const depositUsdt = Number(intent.amount_usdt ?? 0);
  if (!Number.isFinite(depositUsdt) || depositUsdt <= 0) {
    return { ok: true, skipped: true, reason: 'zero_amount' };
  }

  const depositorWallet = String(intent.wallet_address ?? '').trim();
  if (!depositorWallet) return { ok: false, reason: 'depositor_missing' };

  const { data: ref } = await sb
    .from('referrals')
    .select('sponsor_wallet_address')
    .ilike('wallet_address', depositorWallet)
    .eq('referral_type', 'partner')
    .eq('status', 'active')
    .maybeSingle();

  const referrerWallet = (ref?.sponsor_wallet_address as string | undefined)?.trim();
  if (!referrerWallet) {
    return { ok: true, skipped: true, reason: 'no_referrer' };
  }

  const referrerTotalPerfUsdt = await sumReferralTreePerformance(sb, referrerWallet);

  return allocateUd3ForCreditedIntent(sb, {
    intentId,
    depositorWallet,
    referrerWallet,
    depositUsdt,
    referrerTotalPerfUsdt,
  });
}
