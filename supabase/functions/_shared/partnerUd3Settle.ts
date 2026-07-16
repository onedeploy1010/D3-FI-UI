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
  const ledgerRows = [
    {
      event_id: eventId,
      recipient_wallet: input.referrerWallet,
      role: 'direct',
      v_level: settled.tier?.id ?? null,
      v_share_pct: null as number | null,
      gap_pct: null as number | null,
      ud3_amount: settled.directUd3,
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
    await creditUd3Reward(sb, walletLower, round6(amount));
  }

  return { ok: true, eventId };
}

/**
 * NEW-1 (HIGH): credit a UD3 reward ATOMICALLY.
 *
 * `ud3_balance` is a spendable balance DEBITED atomically at re-stake/withdraw time
 * (034 `debit_ud3_balance`). The old read-modify-write credit (SELECT balance;
 * UPDATE balance+amount) races that debit — a debit landing between the read and the
 * write-back is lost (double-spend). So the balance credit goes through the atomic
 * `credit_ud3_balance` RPC (single UPDATE ... += under a row lock). `lifetime_ud3_earned`
 * is a monotonic counter (no atomic debit targets it) so a plain update is fine, and
 * `ud3_balance` is deliberately never written in that update.
 *
 * Credit-first, provision-on-not-found: the RPC matches case-insensitively so an
 * existing (possibly mixed-case) row is credited without provisioning; only a genuinely
 * absent account triggers a row insert + single retry.
 */
async function creditUd3Reward(sb: Sb, walletLower: string, amount: number): Promise<void> {
  const { error: creditErr } = await sb.rpc('credit_ud3_balance', {
    p_wallet: walletLower,
    p_amount: amount,
  });
  if (creditErr) {
    const msg = creditErr.message ?? '';
    if (msg.includes('ACCOUNT_NOT_FOUND') || msg.includes('RECIPIENT_NOT_FOUND')) {
      // Provision the account row WITHOUT seeding a balance (the atomic credit below
      // owns ud3_balance), then retry once.
      await sb.from('partner_accounts').upsert(
        { wallet_address: walletLower },
        { onConflict: 'wallet_address', ignoreDuplicates: true },
      );
      const { error: retryErr } = await sb.rpc('credit_ud3_balance', {
        p_wallet: walletLower,
        p_amount: amount,
      });
      if (retryErr) {
        console.error('[ud3] credit_ud3_balance retry:', retryErr.message);
        return;
      }
    } else {
      console.error('[ud3] credit_ud3_balance:', creditErr.message);
      return;
    }
  }

  // Monotonic lifetime counter (not spendable, no atomic debit) — plain update.
  const { data: acct } = await sb
    .from('partner_accounts')
    .select('wallet_address, lifetime_ud3_earned')
    .ilike('wallet_address', walletLower)
    .maybeSingle();
  if (acct) {
    await sb
      .from('partner_accounts')
      .update({
        lifetime_ud3_earned: round6(Number(acct.lifetime_ud3_earned ?? 0) + amount),
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_address', acct.wallet_address as string);
  }
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
