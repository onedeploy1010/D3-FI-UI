/**
 * UD3 (反向金) RESET + RE-SETTLE engine (test-environment clean rebuild).
 *
 * Goal: 还原所有 UD3 派生数据 (当作没有 UD3 转账、没有 UD3 质押), 只保留测试币 USDT 的
 * 入金/质押记录, 再据此按新模型 (V3 tier-coefficient × cumulative-difference,
 * ud3Reward.ts + ud3RewardConfig.ts) 重算 UD3 与分配.
 *
 *   • dryrun (default) — strictly READ-ONLY. Reports what WOULD be reset (per-table
 *     counts) and what WOULD be recomputed (each credited USDT intent with its
 *     deposit + referrer), and computes the PROJECTED new UD3 split via the exact V3
 *     calculator (guide + allocated network + unallocated) — without any writes.
 *   • apply — HARD-GATED, best-effort. Wipes all UD3-derived data (ledger, events,
 *     calc logs, UD3 transfers, UD3-funded stake positions) and zeroes the UD3/SD3
 *     balance columns, KEEPING the USDT deposit/stake records (stake_intents,
 *     partner_join/crowdfund_stake positions), referrals and performance. Then it
 *     replays every credited USDT stake intent through the CURRENT settle path
 *     (tryAllocateUd3ForCreditedIntent), which now uses the V3 calculator.
 *
 * This touches PRODUCTION-shaped money data. Invariants:
 *   • dryrun performs ZERO writes.
 *   • apply requires BOTH opts.confirm === 'UD3-RESET-RESETTLE' AND
 *     Deno.env.get('ALLOW_UD3_RECOMPUTE') === 'true' — else it throws before any write.
 *   • every projected amount is an exact `Decimal`, serialised as a fixed-6 string.
 */
import Decimal from 'npm:decimal.js@10';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getUd3Tier } from './partnerUd3Rules.ts';
import {
  calculateUd3TierDifferenceRewards,
  type CalculateUd3TierDifferenceRewardsInput,
  type Ud3NetworkAncestor,
} from './ud3Reward.ts';
import { getUd3RewardConfig, tierRank, type Ud3RewardConfig } from './ud3RewardConfig.ts';
import { sumReferralTreePerformance } from './partnerPerformance.ts';
import { tryAllocateUd3ForCreditedIntent } from './partnerUd3Settle.ts';

type Sb = SupabaseClient;

/** Fixed-6 decimal string for numeric columns / display (never a JS Number). */
function f6(value: Decimal): string {
  return value.toFixed(6);
}

// ── the reset plan (single source of truth; pure, unit-testable) ──────────────

export interface Ud3ResetPlan {
  /** UD3-derived tables wiped in full. Order respects FK cascades. */
  deleteAllTables: string[];
  /** partner_stake_positions.kind values that are UD3-FUNDED (deleted). */
  deletePositionKinds: string[];
  /** partner_stake_positions.kind values that are USDT-FUNDED (kept). */
  keepPositionKinds: string[];
  /** partner_accounts columns zeroed (only columns that exist in the schema). */
  accountResetColumns: string[];
  /** stake_intents.intent_type values re-settled. */
  resettleIntentTypes: string[];
  /** stake_intents.status values re-settled. */
  resettleStatuses: string[];
}

/**
 * The static plan of what a reset targets. Pure — no DB, no side effects — so tests
 * can assert exactly which tables/columns/kinds are in scope before anything runs.
 */
export function describeUd3ResetPlan(): Ud3ResetPlan {
  return {
    // ledger has FK event_id -> events ON DELETE CASCADE; calc_logs -> events SET NULL.
    // Delete children first for count clarity, then events, then the standalone tables.
    deleteAllTables: [
      'partner_ud3_ledger',
      'partner_ud3_calc_logs',
      'partner_ud3_events',
      'partner_ud3_transfers',
    ],
    deletePositionKinds: ['ud3', 'sd3'],
    keepPositionKinds: ['partner_join', 'crowdfund_stake'],
    accountResetColumns: [
      'ud3_balance',
      'pending_ud3',
      'lifetime_ud3_earned',
      'sd3_balance',
      'lifetime_sd3_earned',
    ],
    resettleIntentTypes: ['partner_join', 'crowdfund_stake'],
    // A deposit is CONFIRMED (funds received → earns UD3) once it reaches 'credited',
    // then the sweep advances it 'credited' → 'sweep_pending' → 'completed'. The live
    // UD3 settlement fires at 'credited'; a re-settle must therefore replay EVERY
    // post-credit state, else already-swept deposits (sweep_pending/completed) get
    // their UD3 wiped by the reset and never regenerated (missing 直推/级差). Only
    // pre-payment states (awaiting_payment/pending/expired) are excluded.
    resettleStatuses: ['credited', 'sweep_pending', 'completed'],
  };
}

// ── read-only projection helpers ──────────────────────────────────────────────

/** A network ancestor as carried in a calc-log snapshot / rebuilt for projection. */
export interface Ud3SnapshotAncestor {
  wallet: string;
  /** Ancestor's OWN 档位 'S1'..'S6' (or 'S0'/null when none). */
  tierCode?: string | null;
  /** Ancestor's OWN tier rank (derived from tierCode when absent). */
  tierRank?: number;
  /** 资格 eligibility. Defaults to eligible unless explicitly false. */
  isRewardEligible?: boolean;
}

/** Historical/live snapshot shape consumed by the V3 calculator input builder. */
export interface Ud3CalcLogSnapshot {
  depositUsdt: number;
  referrerWallet: string;
  referrerTotalPerfUsdt: number;
  networkChain?: Ud3SnapshotAncestor[];
  guideTierCode?: string | null;
  intentId?: string;
  orderId?: string;
}

/**
 * Rebuild the exact-Decimal V3 calculator input from a snapshot, resolving the guide
 * 档位 from perf and each ancestor's own tier/rank + 资格 from the snapshot, using the
 * CURRENT config only.
 */
export function buildUd3RecomputeInput(
  snapshot: Ud3CalcLogSnapshot,
  config: Ud3RewardConfig,
): CalculateUd3TierDifferenceRewardsInput {
  const referrerWallet = String(snapshot.referrerWallet ?? '').trim();
  const guideTier = getUd3Tier(Number(snapshot.referrerTotalPerfUsdt ?? 0));
  const guideTierCode = guideTier?.label ?? null;

  const chain = Array.isArray(snapshot.networkChain) ? snapshot.networkChain : [];
  const networkAncestors: Ud3NetworkAncestor[] = chain.map((node, i) => {
    const tierCode = (node?.tierCode ?? 'S0') as string;
    const rank = node?.tierRank ?? (tierCode && tierCode !== 'S0' ? tierRank(tierCode, config) : 0);
    return {
      userId: String(node?.wallet ?? '').trim(),
      relationDepth: i + 1,
      tierCode,
      tierRank: rank,
      // Default eligible unless the snapshot explicitly marks it false.
      isRewardEligible: node?.isRewardEligible !== false,
    };
  });

  return {
    orderId: String(snapshot.intentId ?? snapshot.orderId ?? 'resettle'),
    principalAmount: new Decimal(snapshot.depositUsdt ?? 0),
    guideUserId: referrerWallet || null,
    guideTierCode,
    networkAncestors,
    configVersion: config.version,
  };
}

interface CreditedIntent {
  id: string;
  wallet_address: string;
  amount_usdt: number;
}

/**
 * READ-ONLY upline walk above the referrer (mirrors the settle path with NO caching
 * writes): each ancestor's OWN 档位/rank (from team perf) + 资格 (is_partner).
 */
async function fetchUplineChainReadOnly(
  sb: Sb,
  referrerWallet: string,
): Promise<Ud3SnapshotAncestor[]> {
  const chain: Ud3SnapshotAncestor[] = [];
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
    const tier = getUd3Tier(teamPerf);
    const tierCode = tier?.label ?? 'S0';
    const { data: acct } = await sb
      .from('partner_accounts')
      .select('is_partner')
      .ilike('wallet_address', sponsor)
      .maybeSingle();
    const isRewardEligible = (acct as { is_partner?: boolean } | null)?.is_partner === true;

    chain.push({
      wallet: sponsor,
      tierCode,
      tierRank: tier ? tierRank(tierCode) : 0,
      isRewardEligible,
    });
    current = sponsor;
  }
  return chain;
}

export interface ResettleProjection {
  intentId: string;
  referrer: string | null;
  deposit: string;
  guide: string;
  /** Sum of CALCULATED (allocated) network tier slots. */
  networkTotal: string;
  /** Sum of UNALLOCATED network tier slots. */
  unallocated: string;
}

/** READ-ONLY projection of the NEW V3 UD3 split for one credited intent. No writes. */
async function projectUd3ForIntent(
  sb: Sb,
  intent: CreditedIntent,
  config: Ud3RewardConfig,
): Promise<ResettleProjection> {
  const depositUsdt = Number(intent.amount_usdt ?? 0);
  const depositorWallet = String(intent.wallet_address ?? '').trim();
  const zero: ResettleProjection = {
    intentId: intent.id,
    referrer: null,
    deposit: f6(new Decimal(depositUsdt || 0)),
    guide: '0.000000',
    networkTotal: '0.000000',
    unallocated: '0.000000',
  };
  if (!(depositUsdt > 0) || !depositorWallet) return zero;

  const { data: ref } = await sb
    .from('referrals')
    .select('sponsor_wallet_address')
    .ilike('wallet_address', depositorWallet)
    .eq('referral_type', 'partner')
    .eq('status', 'active')
    .maybeSingle();
  const referrerWallet = (ref?.sponsor_wallet_address as string | undefined)?.trim();
  if (!referrerWallet) return zero;

  const referrerTotalPerfUsdt = await sumReferralTreePerformance(sb, referrerWallet);
  const networkChain = await fetchUplineChainReadOnly(sb, referrerWallet);

  const result = calculateUd3TierDifferenceRewards(
    buildUd3RecomputeInput(
      { depositUsdt, referrerWallet, referrerTotalPerfUsdt, networkChain, intentId: intent.id },
      config,
    ),
  );

  return {
    intentId: intent.id,
    referrer: referrerWallet,
    deposit: f6(new Decimal(depositUsdt)),
    guide: f6(result.guideReward.rewardAmount),
    networkTotal: f6(result.networkAllocated),
    unallocated: f6(result.networkUnallocated),
  };
}

// ── read-only count helpers ───────────────────────────────────────────────────

async function countRows(sb: Sb, table: string): Promise<number> {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

async function countPositions(sb: Sb, kinds: string[]): Promise<number> {
  const { count } = await sb
    .from('partner_stake_positions')
    .select('*', { count: 'exact', head: true })
    .in('kind', kinds);
  return count ?? 0;
}

export interface ResetCounts {
  partner_ud3_ledger: number;
  partner_ud3_calc_logs: number;
  partner_ud3_events: number;
  partner_ud3_transfers: number;
  ud3_stake_positions: number;
  kept_usdt_positions: number;
}

async function collectResetCounts(sb: Sb, plan: Ud3ResetPlan): Promise<ResetCounts> {
  return {
    partner_ud3_ledger: await countRows(sb, 'partner_ud3_ledger'),
    partner_ud3_calc_logs: await countRows(sb, 'partner_ud3_calc_logs'),
    partner_ud3_events: await countRows(sb, 'partner_ud3_events'),
    partner_ud3_transfers: await countRows(sb, 'partner_ud3_transfers'),
    ud3_stake_positions: await countPositions(sb, plan.deletePositionKinds),
    kept_usdt_positions: await countPositions(sb, plan.keepPositionKinds),
  };
}

// ── apply-only mutations ──────────────────────────────────────────────────────

/** Wipe all UD3-derived data and zero the UD3/SD3 balance columns. */
async function performReset(sb: Sb, plan: Ud3ResetPlan): Promise<void> {
  // Universal WHERE that matches every row (PostgREST refuses an unfiltered DELETE).
  for (const table of plan.deleteAllTables) {
    const { error } = await sb.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`reset delete ${table}: ${error.message}`);
  }

  // UD3-funded stake positions only; USDT-funded positions are kept.
  const { error: posErr } = await sb
    .from('partner_stake_positions')
    .delete()
    .in('kind', plan.deletePositionKinds);
  if (posErr) throw new Error(`reset delete positions: ${posErr.message}`);

  // Zero the UD3/SD3 balance columns on every account.
  const resetPatch: Record<string, number> = {};
  for (const col of plan.accountResetColumns) resetPatch[col] = 0;
  const { error: acctErr } = await sb
    .from('partner_accounts')
    .update(resetPatch)
    .not('wallet_address', 'is', null);
  if (acctErr) throw new Error(`reset accounts: ${acctErr.message}`);
}

// ── engine ────────────────────────────────────────────────────────────────────

export interface ResettleResult {
  intentId: string;
  ok: boolean;
  eventId?: string;
  referrer?: string | null;
  deposit?: string;
  guide: string;
  networkTotal: string;
  unallocated: string;
  skipped?: boolean;
  reason?: string;
}

export interface ResetResettleSummary {
  mode: 'dryrun' | 'apply';
  reset: ResetCounts;
  resettled: ResettleResult[];
  totals: {
    intents: number;
    newUd3Paid: string;
    newUnallocated: string;
  };
}

export interface ResetResettleOpts {
  mode: 'dryrun' | 'apply';
  confirm?: string;
  limit?: number;
}

/** Select all credited USDT stake intents, oldest first. */
async function selectCreditedUsdtIntents(sb: Sb, plan: Ud3ResetPlan, limit: number): Promise<CreditedIntent[]> {
  const { data } = await sb
    .from('stake_intents')
    .select('id, wallet_address, amount_usdt')
    .in('intent_type', plan.resettleIntentTypes)
    .in('status', plan.resettleStatuses)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as CreditedIntent[];
}

/**
 * Reset all UD3-derived data and re-settle it from the surviving USDT deposits
 * under the current config. dryrun (default) is read-only; apply is hard-gated.
 */
export async function resetAndResettleUd3(sb: Sb, opts: ResetResettleOpts): Promise<ResetResettleSummary> {
  const mode = opts.mode === 'apply' ? 'apply' : 'dryrun';

  // ── HARD GATE (throws BEFORE any read or write in apply mode) ────────────────
  if (mode === 'apply') {
    if (opts.confirm !== 'UD3-RESET-RESETTLE') {
      throw new Error('UD3_RESET_CONFIRM_REQUIRED');
    }
    if (Deno.env.get('ALLOW_UD3_RECOMPUTE') !== 'true') {
      throw new Error('UD3_RESET_DISABLED');
    }
  }

  const config = getUd3RewardConfig();
  const plan = describeUd3ResetPlan();
  const limit = Number.isFinite(opts.limit) && (opts.limit as number) > 0 ? Math.floor(opts.limit as number) : 100000;

  // Counts of what will be / was reset (captured BEFORE any delete so apply reports
  // the pre-reset state).
  const resetCounts = await collectResetCounts(sb, plan);

  // The surviving USDT deposits we will re-settle from.
  const intents = await selectCreditedUsdtIntents(sb, plan, limit);

  // apply: wipe first, then replay.
  if (mode === 'apply') {
    await performReset(sb, plan);
  }

  const resettled: ResettleResult[] = [];
  let newUd3Paid = new Decimal(0);
  let newUnallocated = new Decimal(0);

  for (const intent of intents) {
    if (mode === 'apply') {
      const res = await tryAllocateUd3ForCreditedIntent(sb, intent.id).catch((e) => ({
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      }));
      let guide = '0.000000';
      let networkTotal = '0.000000';
      let unallocated = '0.000000';
      const eventId = (res as { eventId?: string }).eventId;
      if (eventId) {
        const { data: ev } = await sb
          .from('partner_ud3_events')
          .select('direct_ud3, network_allocated_ud3, network_remaining_ud3')
          .eq('id', eventId)
          .maybeSingle();
        if (ev) {
          guide = f6(new Decimal(ev.direct_ud3 ?? 0));
          networkTotal = f6(new Decimal(ev.network_allocated_ud3 ?? 0));
          unallocated = f6(new Decimal(ev.network_remaining_ud3 ?? 0));
        }
      }
      newUd3Paid = newUd3Paid.plus(new Decimal(guide)).plus(new Decimal(networkTotal));
      newUnallocated = newUnallocated.plus(new Decimal(unallocated));
      resettled.push({
        intentId: intent.id,
        ok: Boolean((res as { ok?: boolean }).ok),
        eventId,
        skipped: (res as { skipped?: boolean }).skipped,
        reason: (res as { reason?: string }).reason,
        guide,
        networkTotal,
        unallocated,
      });
    } else {
      const proj = await projectUd3ForIntent(sb, intent, config);
      newUd3Paid = newUd3Paid.plus(new Decimal(proj.guide)).plus(new Decimal(proj.networkTotal));
      newUnallocated = newUnallocated.plus(new Decimal(proj.unallocated));
      resettled.push({
        intentId: proj.intentId,
        ok: true,
        referrer: proj.referrer,
        deposit: proj.deposit,
        guide: proj.guide,
        networkTotal: proj.networkTotal,
        unallocated: proj.unallocated,
      });
    }
  }

  const summary: ResetResettleSummary = {
    mode,
    reset: resetCounts,
    resettled,
    totals: {
      intents: intents.length,
      newUd3Paid: f6(newUd3Paid),
      newUnallocated: f6(newUnallocated),
    },
  };

  // apply: journal the run (dryrun never writes).
  if (mode === 'apply') {
    await sb
      .from('ud3_reset_log')
      .insert({ mode, summary })
      .then(() => undefined, () => undefined);
  }

  return summary;
}
