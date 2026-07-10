import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { startOfSgtDayIso } from './partnerTimezone.ts';

type Sb = SupabaseClient;

/** Roll up partner crowdfund / join volume to referral performance_weight and sponsors. */
export async function rollupPartnerPerformance(
  sb: Sb,
  walletAddress: string,
  amountUsdt: number,
): Promise<void> {
  if (amountUsdt <= 0) return;

  const { data: refs, error } = await sb
    .from('referrals')
    .select('id, sponsor_wallet_address, performance_weight')
    .eq('wallet_address', walletAddress)
    .eq('referral_type', 'partner')
    .eq('status', 'active');

  if (error) {
    console.error('[partnerPerformance] referral lookup:', error.message);
    return;
  }
  if (!refs?.length) return;

  for (const ref of refs) {
    const prev = Number(ref.performance_weight ?? 0);
    const next = Math.round((prev + amountUsdt) * 100) / 100;
    const { error: updErr } = await sb
      .from('referrals')
      .update({ performance_weight: next })
      .eq('id', ref.id);
    if (updErr) {
      console.error('[partnerPerformance] update weight:', updErr.message);
    }
  }
}

export type PartnerTeamStats = {
  personalPerformanceUsd: number;
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
};


async function collectPartnerDownlineWallets(sb: Sb, wallet: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [wallet];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift()!;
    const key = current.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const { data: directs } = await sb
      .from('referrals')
      .select('wallet_address')
      .eq('sponsor_wallet_address', current)
      .eq('referral_type', 'partner')
      .eq('status', 'active');

    for (const row of directs ?? []) {
      const addr = row.wallet_address as string;
      out.push(addr);
      queue.push(addr);
    }
  }
  return out;
}

async function sumReferralTreePerformance(sb: Sb, wallet: string): Promise<number> {
  const downline = await collectPartnerDownlineWallets(sb, wallet);
  if (!downline.length) return 0;

  const { data: refs } = await sb
    .from('referrals')
    .select('performance_weight')
    .in('wallet_address', downline)
    .eq('referral_type', 'partner')
    .eq('status', 'active');

  return (refs ?? []).reduce((s, r) => s + Number(r.performance_weight ?? 0), 0);
}

/** Aggregate partner team stats for a sponsor wallet from referrals + stake_intents. */
export async function fetchPartnerTeamStats(sb: Sb, wallet: string): Promise<PartnerTeamStats> {
  const dayStart = startOfSgtDayIso();

  const [downlineVolume, { data: ownIntents }, downlineWallets] = await Promise.all([
    sumReferralTreePerformance(sb, wallet),
    sb
      .from('stake_intents')
      .select('amount_usdt')
      .eq('wallet_address', wallet)
      .in('status', ['credited', 'completed', 'sweep_pending', 'sweeping']),
    collectPartnerDownlineWallets(sb, wallet),
  ]);

  const personalPerformanceUsd = Math.round(
    (ownIntents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0) * 100,
  ) / 100;

  const teamPerformanceUsd = Math.round(downlineVolume * 100) / 100;

  let dailyNewPerformanceUsd = 0;
  if (downlineWallets.length) {
    const { data: todayIntents } = await sb
      .from('stake_intents')
      .select('amount_usdt')
      .in('wallet_address', downlineWallets)
      .in('status', ['credited', 'completed', 'sweep_pending', 'sweeping'])
      .gte('updated_at', dayStart);
    dailyNewPerformanceUsd = Math.round(
      (todayIntents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0) * 100,
    ) / 100;
  }

  return { personalPerformanceUsd, teamPerformanceUsd, dailyNewPerformanceUsd };
}

const PARTNER_JOIN_STATUSES = ['credited', 'completed', 'sweep_pending'];

/** Wallets that completed partner join (入盟). */
export async function fetchPartnerMemberWallets(sb: Sb, wallets: string[]): Promise<string[]> {
  const unique = [...new Set(wallets.map((w) => w.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const { data, error } = await sb
    .from('stake_intents')
    .select('wallet_address')
    .eq('intent_type', 'partner_join')
    .in('status', PARTNER_JOIN_STATUSES)
    .in('wallet_address', unique);

  if (error) {
    console.error('[partnerPerformance] partner member lookup:', error.message);
    return [];
  }

  return [...new Set((data ?? []).map((row) => String(row.wallet_address).toLowerCase()))];
}
