/**
 * Allocate UD3 when a USDT stake intent is credited
 * (partner_join / crowdfund_stake — not SD3 re-stake).
 *
 * V3: the reward split is computed by the versioned, exact-Decimal calculator
 * (_shared/ud3Reward.ts + ud3RewardConfig.ts, model
 * "tier-coefficient × cumulative-difference"). This module only resolves the
 * on-chain/DB context (引路人 档位 + up-chain ancestors, each with their OWN 档位/rank
 * and 资格 eligibility), hands a fully-materialised input to the calculator, then
 * persists an audited snapshot and credits each RECEIVER's pending_ud3.
 *
 * The 网体 reward is six independent tier slots S1..S6. Each slot is matched to the
 * nearest up-chain ancestor whose OWN tier rank >= the slot rank AND who is
 * reward-eligible (资格). A matched slot is CALCULATED (paid to that receiver); an
 * unmatched slot is UNALLOCATED (recorded, never credited). The 引路人 (guide) reward
 * is an independent ladder always paid to the referrer.
 *
 * Money is NEVER a JS Number: every amount is a Decimal and is written to the
 * numeric columns / RPCs as a fixed-6 decimal STRING so full precision survives.
 *
 * Idempotency: the calculator's deterministic per-slot idempotency_key is a unique
 * index on partner_ud3_ledger, so a re-run that races past the intent_id
 * short-circuit hits a 23505 on the row insert — we skip that row and do NOT
 * re-credit it.
 *
 * Call after rollupPartnerPerformance so 引路人 total perf includes the new volume.
 */
import Decimal from 'npm:decimal.js@10';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { resolveUd3SLevel, UD3_TIERS } from './partnerUd3Rules.ts';
import { notify } from './notifications.ts';
import {
  calculateUd3TierDifferenceRewards,
  ud3TierRewardIdempotencyKey,
  type Ud3NetworkAncestor,
} from './ud3Reward.ts';
import {
  getUd3RewardConfig,
  tierRank,
  UD3_ALGO_VERSION_V3,
} from './ud3RewardConfig.ts';
import { sumReferralTreePerformance, fetchPartnerAreaStats, isEffectiveCustomer } from './partnerPerformance.ts';
import { toSgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

const UD3_STAKE_INTENT_TYPES = new Set(['partner_join', 'crowdfund_stake']);
/** Sentinel recipient for an UNALLOCATED tier slot (no account is credited). */
const UD3_UNALLOCATED_SINK = 'unallocated:ud3';

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

// Recompute-only fast path. When ON, the upline walk reads the MATERIALIZED
// team_perf_usdt / small_area_perf_usdt off partner_accounts instead of re-walking
// the subtree per ancestor. Safe ONLY for the reset+resettle engine, which rebuilds
// from FINAL standing (performance is not reset), so cached == fresh there. Live
// settlement keeps flag OFF and always computes fresh. Falls back to fresh compute
// when a row has no cached value.
let ud3UseCachedLevels = false;
export function setUd3UseCachedLevels(on: boolean): void {
  ud3UseCachedLevels = on;
}

// Recompute-only preloaded 有效客户 set (lowercased wallets with 个人入金 ≥100U). When
// present, eligibility is an O(1) membership check instead of a per-ancestor query —
// this keeps the reset+resettle within the edge time budget. Live settlement leaves it
// null and computes fresh per deposit. Set/cleared by resetAndResettleUd3 (try/finally).
let ud3EffectiveSet: Set<string> | null = null;
export function setUd3EffectiveCustomerSet(s: Set<string> | null): void {
  ud3EffectiveSet = s;
}

/** Resolve {teamPerf(总), smallArea(小区)} for a wallet — cached fast path or fresh. */
async function loadTeamAndSmallArea(
  sb: Sb,
  wallet: string,
): Promise<{ teamPerf: number; smallArea: number }> {
  if (ud3UseCachedLevels) {
    const { data } = await sb
      .from('partner_accounts')
      .select('team_perf_usdt, small_area_perf_usdt')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    const t = (data as { team_perf_usdt?: number | null } | null)?.team_perf_usdt;
    const s = (data as { small_area_perf_usdt?: number | null } | null)?.small_area_perf_usdt;
    if (t != null && s != null) return { teamPerf: Number(t), smallArea: Number(s) };
  }
  const areas = await fetchPartnerAreaStats(sb, wallet);
  return {
    teamPerf: Math.round((areas.smallAreaUsd + areas.largeAreaUsd) * 100) / 100,
    smallArea: areas.smallAreaUsd,
  };
}

/** 总业绩 only (引路人档位). Cached fast path under recompute; else fresh downline sum. */
async function loadTeamPerf(sb: Sb, wallet: string): Promise<number> {
  if (ud3UseCachedLevels) {
    const { data } = await sb
      .from('partner_accounts')
      .select('team_perf_usdt')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    const t = (data as { team_perf_usdt?: number | null } | null)?.team_perf_usdt;
    if (t != null) return Number(t);
  }
  return sumReferralTreePerformance(sb, wallet);
}

async function cacheAccountLevels(
  sb: Sb,
  wallet: string,
  teamPerfUsdt: number,
  smallAreaPerfUsdt: number,
): Promise<void> {
  // 统一等级：引路人受贿金系数 与 网体差额 共用同一 S1-S6 等级。
  // S1=总业绩≥100；S2-S6=小区业绩。ud3_tier_id 与 ud3_v_level 记同一等级。
  const level = resolveUd3SLevel({ totalPerfUsdt: teamPerfUsdt, smallAreaPerfUsdt });
  // Detect a達標升级 for the 小铃铛 (skip during recompute — the cached-levels flag is
  // on then, and a full reset+replay must not spam every account with level-ups).
  let prevLevelId = 0;
  if (!ud3UseCachedLevels) {
    const { data: prev } = await sb
      .from('partner_accounts')
      .select('ud3_v_level')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    prevLevelId = Number((prev as { ud3_v_level?: number | null } | null)?.ud3_v_level ?? 0);
  }
  await sb.from('partner_accounts').upsert(
    {
      wallet_address: wallet,
      ud3_tier_id: level?.id ?? null,
      ud3_v_level: level?.id ?? null,
      // 物化原始业绩：供展示/风控/审计快速读取（结算仍按需实时重算，不读此缓存）。
      team_perf_usdt: teamPerfUsdt,
      small_area_perf_usdt: smallAreaPerfUsdt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' },
  );
  if (!ud3UseCachedLevels && level && level.id > prevLevelId) {
    await notify(sb, wallet, 'level_up', { level: level.label });
  }
}

/**
 * Reward eligibility (资格) of an ancestor account: it must exist AND be a partner.
 * This is the 资格 gate that is orthogonal to 档位 (tier-rank) matching — a
 * high-tier but non-partner ancestor can still be skipped for a slot.
 */
// UD3 领取资格 = 有效客户（个人累计入金 ≥ 100U），不再要求 is_partner（合伙人）。
// 重算时用预加载集合做 O(1) 判定；实时结算无集合则逐个查询。
async function isRewardEligibleAccount(sb: Sb, wallet: string): Promise<boolean> {
  if (ud3EffectiveSet) return ud3EffectiveSet.has(wallet.trim().toLowerCase());
  return isEffectiveCustomer(sb, wallet);
}

/**
 * Walk UP from the referrer, materialising each ancestor's OWN 档位 (tierCode/rank
 * from their team performance) and their 资格 eligibility. Nearest ancestor first
 * (relationDepth 1 = the referrer's own sponsor). Caches level snapshots best-effort.
 */
async function fetchUplineChainAbove(sb: Sb, referrerWallet: string): Promise<Ud3NetworkAncestor[]> {
  const chain: Ud3NetworkAncestor[] = [];
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

    // 总业绩 = 所有直推分支合计 = 小区 + 大区（等价于 sumReferralTreePerformance），
    // 由分区结果一次推出，省去对同一子树的第二次全量遍历。recompute 时读物化列。
    const { teamPerf, smallArea: networkPerf } = await loadTeamAndSmallArea(sb, sponsor);
    // 网体 S-级别（决定该祖先可承接的 S1..S6 网体差额槽）按【小区业绩】达标，含 1000U
    // 入门线。必须用 resolveUd3SLevel：getUd3Tier 无入门线，会把小区<1000 的上级误判成
    // S1(rank 1) 并发放 S1 网体差额——那是超额分配。引路人 档位/奖励比例仍按总业绩。
    const sLevel = resolveUd3SLevel({ totalPerfUsdt: teamPerf, smallAreaPerfUsdt: networkPerf });
    const tierCode = sLevel?.label ?? 'S0';
    const rank = sLevel ? tierRank(tierCode) : 0;
    const eligible = await isRewardEligibleAccount(sb, sponsor);

    chain.push({
      userId: sponsor,
      relationDepth: chain.length + 1,
      tierCode,
      tierRank: rank,
      isRewardEligible: eligible,
    });
    await cacheAccountLevels(sb, sponsor, teamPerf, networkPerf).catch(() => {});

    current = sponsor;
  }

  return chain;
}

/** Credits UD3 for a deposit using referrer 档位 + network tier-difference slots. Idempotent on intent_id. */
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

  const referrerArea = await loadTeamAndSmallArea(sb, input.referrerWallet).catch(() => ({
    teamPerf: input.referrerTotalPerfUsdt,
    smallArea: 0,
  }));
  await cacheAccountLevels(
    sb,
    input.referrerWallet,
    input.referrerTotalPerfUsdt,
    referrerArea.smallArea,
  ).catch(() => {});

  const networkAncestors = await fetchUplineChainAbove(sb, input.referrerWallet);

  // ── Build the calculator input (config-versioned, Decimal, single source) ───
  const config = getUd3RewardConfig();
  const version = config.version;
  const algoVersion = config.algorithmVersion ?? UD3_ALGO_VERSION_V3;

  // 引路人受贿金档位 = 统一等级（S1=总业绩≥100；S2-S6=小区业绩），与网体同一标准。
  const guideLevel = resolveUd3SLevel({
    totalPerfUsdt: input.referrerTotalPerfUsdt,
    smallAreaPerfUsdt: referrerArea.smallArea,
  });
  // 引路人也须是有效客户（≥100U）才领 60% 直推；否则不发放。
  const guideEligible = await isRewardEligibleAccount(sb, input.referrerWallet);
  const guideTierCode = guideLevel && guideEligible ? guideLevel.label : null;
  const guideRatePct = guideLevel ? (UD3_TIERS[guideLevel.id - 1]?.ratePct ?? 0) : 0;

  const result = calculateUd3TierDifferenceRewards({
    orderId: input.intentId,
    principalAmount: new Decimal(input.depositUsdt),
    guideUserId: input.referrerWallet,
    guideTierCode,
    networkAncestors,
    configVersion: version,
  });

  // Conservation (defence-in-depth; the calculator also asserts this).
  const reconciled = result.networkAllocated.plus(result.networkUnallocated);
  if (!reconciled.equals(result.networkTotalCalculated)) {
    console.error(
      `[ud3] conservation violated for ${input.intentId}: ` +
        `${reconciled.toString()} != ${result.networkTotalCalculated.toString()}`,
    );
    return { ok: false };
  }
  // Allocated must equal the sum of CALCULATED tier slots — invariant on the
  // calculator output (independent of what actually inserts on replay).
  const calcAllocated = result.tierRewards
    .filter((t) => t.status === 'CALCULATED')
    .reduce((s, t) => s.plus(t.rewardAmount), new Decimal(0));
  if (!calcAllocated.equals(result.networkAllocated)) {
    console.error(
      `[ud3] allocated mismatch for ${input.intentId}: ` +
        `${calcAllocated.toString()} != ${result.networkAllocated.toString()}`,
    );
    return { ok: false };
  }

  const guideAmount = result.guideReward.rewardAmount;
  // Nothing to distribute at all → skip (no event, safe to retry later).
  if (guideAmount.lte(0) && result.networkTotalCalculated.lte(0)) {
    return { ok: true, skipped: true };
  }

  // ── Event snapshot (legacy columns kept for existing readers) ──────────────
  // generated_ud3 = guide + full network calculated; network_pool_ud3 = network total;
  // network_allocated_ud3 / network_remaining_ud3 = allocated / unallocated slices.
  const generatedUd3 = guideAmount.plus(result.networkTotalCalculated);
  const { data: event, error: eventErr } = await sb
    .from('partner_ud3_events')
    .insert({
      intent_id: input.intentId,
      depositor_wallet: input.depositorWallet,
      referrer_wallet: input.referrerWallet,
      deposit_usdt: f6(new Decimal(input.depositUsdt)),
      referrer_total_perf_usdt: input.referrerTotalPerfUsdt,
      tier_id: guideLevel?.id ?? null,
      tier_rate_pct: guideRatePct,
      generated_ud3: f6(generatedUd3),
      direct_ud3: f6(guideAmount),
      network_pool_ud3: f6(result.networkTotalCalculated),
      network_allocated_ud3: f6(result.networkAllocated),
      network_remaining_ud3: f6(result.networkUnallocated),
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
    principal_amount: f6(new Decimal(input.depositUsdt)),
    total_bribe_amount: f6(generatedUd3),
    network_base_pool: f6(result.networkTotalCalculated),
    level_config_version: version,
    reward_algorithm_version: algoVersion,
    calculated_at: nowIso,
  };

  // ① 引路人 GUIDE_REWARD row (independent ladder — always to the referrer).
  const guideStatus = await insertLedgerRow(sb, {
    ...baseSnapshot,
    recipient_wallet: input.referrerWallet,
    role: 'direct',
    reward_type: 'GUIDE_REWARD',
    reward_status: guideAmount.gt(0) ? 'CALCULATED' : 'NO_DIFFERENCE',
    beneficiary_level: guideTierCode,
    // The guide (引路人) ladder is INDEPENDENT of the S1..S6 network slots. Do NOT
    // stamp reward_tier_code here — a guide at tier S1 would otherwise collide with
    // the network S1 slot and shadow it in per-tier readers. The guide 档位 lives in
    // beneficiary_level; tier_coefficient carries its 系数.
    reward_tier_code: null,
    reward_tier_rank: null,
    tier_coefficient: f6(result.guideReward.coefficient),
    guide_level_rate: f6(result.guideReward.coefficient),
    v_level: guideLevel?.id ?? null,
    v_share_pct: null,
    gap_pct: null,
    ud3_amount: f6(guideAmount),
    idempotency_key: ud3TierRewardIdempotencyKey(input.intentId, 'GUIDE', algoVersion),
    settled: false,
  });
  if (guideStatus === 'inserted' && guideAmount.gt(0)) {
    addCredit(input.referrerWallet, guideAmount);
  }

  // ② 网体 rows — one per tier slot S1..S6.
  //    CALCULATED → NETWORK_DIFFERENCE_REWARD paid to the matched receiver.
  //    No qualified/eligible ancestor → the slot is BURNED (记录销毁): a BURN row is
  //    recorded to the burn sink (no credit), keeping reward_status=UNALLOCATED +
  //    unallocated_reason for audit. Policy: 网体无合格上级 → 销毁.
  for (const slot of result.tierRewards) {
    const calculated = slot.status === 'CALCULATED';
    const recipient = calculated ? slot.receiverUserId! : UD3_UNALLOCATED_SINK;
    const st = await insertLedgerRow(sb, {
      ...baseSnapshot,
      recipient_wallet: recipient,
      role: calculated ? 'differential' : 'reserve',
      reward_type: calculated ? 'NETWORK_DIFFERENCE_REWARD' : 'BURN',
      reward_status: calculated ? 'CALCULATED' : 'UNALLOCATED',
      unallocated_reason: calculated ? null : slot.unallocatedReason,
      relation_depth: slot.receiverRelationDepth,
      reward_tier_code: slot.rewardTierCode,
      reward_tier_rank: slot.rewardTierRank,
      receiver_tier_code: slot.receiverTierCode,
      receiver_tier_rank: slot.receiverTierRank,
      beneficiary_level: slot.receiverTierCode,
      tier_coefficient: f6(slot.tierCoefficient),
      cumulative_rate: f6(slot.cumulativeRate),
      previous_released_rate: f6(slot.previousCumulativeRate),
      difference_rate: f6(slot.incrementalRate),
      incremental_rate: f6(slot.incrementalRate),
      v_level: parseSLevelId(slot.receiverTierCode),
      v_share_pct: f6(slot.cumulativeRate.times(100)),
      gap_pct: f6(slot.incrementalRate.times(100)),
      ud3_amount: f6(slot.rewardAmount),
      idempotency_key: ud3TierRewardIdempotencyKey(input.intentId, slot.rewardTierCode, algoVersion),
      settled: false,
    });
    if (st === 'inserted' && calculated) {
      addCredit(slot.receiverUserId!, slot.rewardAmount);
    }
  }

  await sb.from('partner_ud3_calc_logs').insert({
    event_id: eventId,
    kind: 'settle',
    input: {
      depositUsdt: input.depositUsdt,
      referrerWallet: input.referrerWallet,
      referrerTotalPerfUsdt: input.referrerTotalPerfUsdt,
      guideTierCode,
      networkAncestors,
      configVersion: version,
      algorithmVersion: algoVersion,
    },
    output: {
      guideReward: {
        userId: result.guideReward.userId,
        tierCode: result.guideReward.tierCode,
        coefficient: result.guideReward.coefficient.toString(),
        rewardAmount: f6(result.guideReward.rewardAmount),
      },
      networkRate: result.networkRate.toString(),
      networkTotalCalculated: f6(result.networkTotalCalculated),
      networkAllocated: f6(result.networkAllocated),
      networkUnallocated: f6(result.networkUnallocated),
      tierRewards: result.tierRewards.map((t) => ({
        rewardTierCode: t.rewardTierCode,
        rewardTierRank: t.rewardTierRank,
        status: t.status,
        rewardAmount: f6(t.rewardAmount),
        receiverUserId: t.receiverUserId,
        receiverTierCode: t.receiverTierCode,
        receiverRelationDepth: t.receiverRelationDepth,
        unallocatedReason: t.unallocatedReason,
      })),
      algorithmVersion: result.algorithmVersion,
      configVersion: result.configVersion,
    },
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

  const referrerTotalPerfUsdt = await loadTeamPerf(sb, referrerWallet);

  return allocateUd3ForCreditedIntent(sb, {
    intentId,
    depositorWallet,
    referrerWallet,
    depositUsdt,
    referrerTotalPerfUsdt,
  });
}
