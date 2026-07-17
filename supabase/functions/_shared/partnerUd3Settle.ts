/**
 * Allocate UD3 when a USDT stake intent is credited
 * (partner_join / crowdfund_stake — not SD3 re-stake).
 *
 * Call after rollupPartnerPerformance so 引路人 total perf includes the new volume.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  getUd3Tier,
  resolveUd3SLevel,
  settleUd3DepositEvent,
  type Ud3UplineNode,
} from './partnerUd3Rules.ts';
import { sumReferralTreePerformance } from './partnerPerformance.ts';
import { toSgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

const UD3_STAKE_INTENT_TYPES = new Set(['partner_join', 'crowdfund_stake']);

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function parseSLevelId(label?: string): number | null {
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

/** Credits UD3 for a deposit using referrer tier + network differential. Idempotent on intent_id. */
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

  const { data: existing } = await sb
    .from('partner_ud3_events')
    .select('id')
    .eq('intent_id', input.intentId)
    .maybeSingle();
  if (existing) return { ok: true, skipped: true, eventId: existing.id as string };

  await cacheAccountLevels(sb, input.referrerWallet, input.referrerTotalPerfUsdt).catch(() => {});

  const networkChain = await fetchUplineChainAbove(sb, input.referrerWallet);
  const settled = settleUd3DepositEvent({
    depositUsdt: input.depositUsdt,
    referrerWallet: input.referrerWallet,
    referrerTotalPerfUsdt: input.referrerTotalPerfUsdt,
    networkChainAboveReferrer: networkChain,
  });

  if (settled.generatedUd3 <= 0) {
    return { ok: true, skipped: true };
  }

  const { data: event, error: eventErr } = await sb
    .from('partner_ud3_events')
    .insert({
      intent_id: input.intentId,
      depositor_wallet: input.depositorWallet,
      referrer_wallet: input.referrerWallet,
      deposit_usdt: input.depositUsdt,
      referrer_total_perf_usdt: input.referrerTotalPerfUsdt,
      tier_id: settled.tier?.id ?? null,
      tier_rate_pct: settled.tierRatePct,
      generated_ud3: settled.generatedUd3,
      direct_ud3: settled.directUd3,
      network_pool_ud3: settled.networkPoolUd3,
      network_allocated_ud3: settled.network.allocatedUd3,
      network_remaining_ud3: settled.network.remainingUd3,
    })
    .select('id')
    .single();

  if (eventErr || !event) {
    console.error('[ud3] event insert:', eventErr?.message);
    return { ok: false };
  }

  const eventId = event.id as string;
  // Rewards accrue as UNSETTLED (settled=false) and only become spendable at the
  // daily SGT-midnight run (settle_pending_ud3). The reserve row has no recipient
  // account, so it is marked settled immediately (informational only).
  const ledgerRows = [
    {
      event_id: eventId,
      recipient_wallet: input.referrerWallet,
      role: 'direct',
      v_level: settled.tier?.id ?? null,
      v_share_pct: null as number | null,
      gap_pct: null as number | null,
      ud3_amount: settled.directUd3,
      settled: false,
    },
    ...settled.network.payouts
      .filter((p) => p.ud3Amount > 0)
      .map((p) => ({
        event_id: eventId,
        recipient_wallet: p.wallet,
        role: 'differential' as const,
        v_level: parseSLevelId(p.vLabel),
        v_share_pct: p.vSharePct,
        gap_pct: p.gapPct,
        ud3_amount: p.ud3Amount,
        settled: false,
      })),
  ];

  if (settled.network.remainingUd3 > 0) {
    ledgerRows.push({
      event_id: eventId,
      recipient_wallet: 'treasury:ud3_reserve',
      role: 'reserve',
      v_level: null,
      v_share_pct: settled.network.remainingPct,
      gap_pct: settled.network.remainingPct,
      ud3_amount: settled.network.remainingUd3,
      settled: true,
    });
  }

  const { error: ledgerErr } = await sb.from('partner_ud3_ledger').insert(ledgerRows);
  if (ledgerErr) {
    console.error('[ud3] ledger insert:', ledgerErr.message);
    return { ok: false };
  }

  await sb.from('partner_ud3_calc_logs').insert({
    event_id: eventId,
    kind: 'settle',
    input: {
      depositUsdt: input.depositUsdt,
      referrerWallet: input.referrerWallet,
      referrerTotalPerfUsdt: input.referrerTotalPerfUsdt,
      networkChain,
      referrerNetworkSharePct: settled.referrerNetworkSharePct,
    },
    output: settled,
  });

  // Credit UD3 balances for referrer + differential winners
  const creditMap = new Map<string, number>();
  if (settled.directUd3 > 0) {
    creditMap.set(input.referrerWallet.toLowerCase(), settled.directUd3);
  }
  for (const p of settled.network.payouts) {
    if (p.ud3Amount <= 0) continue;
    const k = p.wallet.toLowerCase();
    creditMap.set(k, round6((creditMap.get(k) ?? 0) + p.ud3Amount));
  }

  for (const [walletLower, amount] of creditMap) {
    if (amount <= 0) continue;
    await creditPendingUd3Reward(sb, walletLower, round6(amount));
  }

  // Immediate settlement (product change): UD3 becomes spendable the instant the
  // downline deposit is credited — no waiting for the SGT-midnight run. Move each
  // recipient's pending_ud3 into ud3_balance now and flip this event's ledger rows
  // to settled. The daily run still acts as a retry safety net: any wallet whose
  // settle errors here keeps its rows settled=false and is caught at midnight.
  await settleEventImmediately(sb, eventId, [...creditMap.keys()]);

  return { ok: true, eventId };
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

  const flip = { settled: true, settled_at: nowIso, settlement_date: settlementDate };
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
 * Two-phase settlement (043): generation credits `pending_ud3` only — the reward is
 * not spendable until the daily SGT-midnight run moves it into `ud3_balance` and
 * bumps `lifetime_ud3_earned` (settle_pending_ud3). The atomic `credit_pending_ud3`
 * RPC is a single UPDATE ... += under a row lock, matching case-insensitively.
 *
 * Credit-first, provision-on-not-found: only a genuinely absent account triggers a
 * row insert + single retry.
 */
async function creditPendingUd3Reward(sb: Sb, walletLower: string, amount: number): Promise<void> {
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
