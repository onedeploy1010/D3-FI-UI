/**
 * Allocate UD3 when a stake intent is credited.
 * Wire from partnerSettlement / treasury after deposit credit.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  settleUd3DepositEvent,
  type Ud3UplineNode,
} from './partnerUd3Rules.ts';

type Sb = SupabaseClient;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

async function fetchUplineChainAbove(
  sb: Sb,
  referrerWallet: string,
): Promise<Ud3UplineNode[]> {
  // Walk sponsor_wallet chain upward from referrer's sponsor.
  const chain: Ud3UplineNode[] = [];
  let current = referrerWallet;
  const seen = new Set<string>();

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

    const { data: acct } = await sb
      .from('partner_accounts')
      .select('ud3_v_level')
      .ilike('wallet_address', sponsor)
      .maybeSingle();

    const vLevel = Number(acct?.ud3_v_level ?? 0);
    const sharePct =
      vLevel === 1 ? 20 :
      vLevel === 2 ? 40 :
      vLevel === 3 ? 55 :
      vLevel === 4 ? 70 :
      vLevel === 5 ? 85 :
      vLevel === 6 ? 100 : 0;

    chain.push({
      wallet: sponsor,
      vSharePct: sharePct,
      vLabel: vLevel >= 1 && vLevel <= 6 ? `V${vLevel}` : undefined,
    });
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
  const { data: existing } = await sb
    .from('partner_ud3_events')
    .select('id')
    .eq('intent_id', input.intentId)
    .maybeSingle();
  if (existing) return { ok: true, skipped: true, eventId: existing.id as string };

  const networkChain = await fetchUplineChainAbove(sb, input.referrerWallet);
  const settled = settleUd3DepositEvent({
    depositUsdt: input.depositUsdt,
    referrerWallet: input.referrerWallet,
    referrerTotalPerfUsdt: input.referrerTotalPerfUsdt,
    networkChainAboveReferrer: networkChain,
  });

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
      v_level: null,
      v_share_pct: null,
      gap_pct: null,
      ud3_amount: settled.directUd3,
    },
    ...settled.network.payouts
      .filter((p) => p.ud3Amount > 0)
      .map((p) => ({
        event_id: eventId,
        recipient_wallet: p.wallet,
        role: 'differential' as const,
        v_level: p.vLabel ? Number(p.vLabel.replace('V', '')) : null,
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
    },
    output: settled,
  });

  // Credit balances
  const creditMap = new Map<string, number>();
  creditMap.set(input.referrerWallet.toLowerCase(), settled.directUd3);
  for (const p of settled.network.payouts) {
    if (p.ud3Amount <= 0) continue;
    const k = p.wallet.toLowerCase();
    creditMap.set(k, round6((creditMap.get(k) ?? 0) + p.ud3Amount));
  }

  for (const [walletLower, amount] of creditMap) {
    const { data: acct } = await sb
      .from('partner_accounts')
      .select('wallet_address, ud3_balance, lifetime_ud3_earned')
      .ilike('wallet_address', walletLower)
      .maybeSingle();
    if (!acct) {
      await sb.from('partner_accounts').upsert(
        {
          wallet_address: walletLower,
          ud3_balance: amount,
          lifetime_ud3_earned: amount,
        },
        { onConflict: 'wallet_address' },
      );
      continue;
    }
    await sb
      .from('partner_accounts')
      .update({
        ud3_balance: round6(Number(acct.ud3_balance ?? 0) + amount),
        lifetime_ud3_earned: round6(Number(acct.lifetime_ud3_earned ?? 0) + amount),
      })
      .eq('wallet_address', acct.wallet_address as string);
  }

  return { ok: true, eventId };
}
