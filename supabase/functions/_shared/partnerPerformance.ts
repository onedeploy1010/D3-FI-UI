import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { startOfSgtDayIso, sgtDayBounds } from './partnerTimezone.ts';
import {
  computePartnerAreaStatsFromLines,
  getBribeTier,
  getBribeTierSplit,
  splitEventSd3,
  type PartnerAreaStats,
} from './partnerSd3Rules.ts';

type Sb = SupabaseClient;

const CREDITED_STATUSES = ['credited', 'completed', 'sweep_pending', 'sweeping'];

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
  smallAreaPerformanceUsd: number;
  smallAreaNewPerformanceUsd: number;
  largeAreaPerformanceUsd: number;
  largeAreaNewPerformanceUsd: number;
};

export async function collectPartnerDownlineWallets(sb: Sb, wallet: string): Promise<string[]> {
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
      .ilike('sponsor_wallet_address', current)
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

async function sumPersonalPerformance(sb: Sb, wallet: string): Promise<number> {
  const { data: ownIntents } = await sb
    .from('stake_intents')
    .select('amount_usdt')
    .eq('wallet_address', wallet)
    .in('status', CREDITED_STATUSES);
  return Math.round(
    (ownIntents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0) * 100,
  ) / 100;
}

async function sumBranchDailyNew(sb: Sb, rootWallet: string, dayStartIso: string, endIso?: string): Promise<number> {
  const wallets = await collectPartnerDownlineWallets(sb, rootWallet);
  wallets.push(rootWallet);
  let q = sb
    .from('stake_intents')
    .select('amount_usdt')
    .in('wallet_address', wallets)
    .in('status', CREDITED_STATUSES)
    .gte('updated_at', dayStartIso);
  if (endIso) q = q.lte('updated_at', endIso);
  const { data } = await q;
  return Math.round((data ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0) * 100) / 100;
}

export async function fetchDirectPartnerReferrals(sb: Sb, wallet: string): Promise<string[]> {
  const { data } = await sb
    .from('referrals')
    .select('wallet_address')
    .ilike('sponsor_wallet_address', wallet)
    .eq('referral_type', 'partner')
    .eq('status', 'active');
  return (data ?? []).map((r) => r.wallet_address as string);
}

async function getBranchTeamVolume(sb: Sb, rootWallet: string): Promise<number> {
  const [personal, team] = await Promise.all([
    sumPersonalPerformance(sb, rootWallet),
    sumReferralTreePerformance(sb, rootWallet),
  ]);
  return Math.round((personal + team) * 100) / 100;
}

export async function fetchPartnerAreaStats(
  sb: Sb,
  wallet: string,
  dayStartIso = startOfSgtDayIso(),
  dayEndIso?: string,
): Promise<PartnerAreaStats> {
  const directs = await fetchDirectPartnerReferrals(sb, wallet);
  const lines = await Promise.all(
    directs.map(async (child) => ({
      teamUsd: await getBranchTeamVolume(sb, child),
      dailyNewUsd: await sumBranchDailyNew(sb, child, dayStartIso, dayEndIso),
    })),
  );
  return computePartnerAreaStatsFromLines(lines);
}

/** Aggregate partner team stats for a sponsor wallet from referrals + stake_intents. */
export async function fetchPartnerTeamStats(sb: Sb, wallet: string): Promise<PartnerTeamStats> {
  const dayStart = startOfSgtDayIso();

  const [downlineVolume, personalPerformanceUsd, downlineWallets, areas] = await Promise.all([
    sumReferralTreePerformance(sb, wallet),
    sumPersonalPerformance(sb, wallet),
    collectPartnerDownlineWallets(sb, wallet),
    fetchPartnerAreaStats(sb, wallet, dayStart),
  ]);

  const teamPerformanceUsd = Math.round(downlineVolume * 100) / 100;

  let dailyNewPerformanceUsd = 0;
  if (downlineWallets.length) {
    const { data: todayIntents } = await sb
      .from('stake_intents')
      .select('amount_usdt')
      .in('wallet_address', downlineWallets)
      .in('status', CREDITED_STATUSES)
      .gte('updated_at', dayStart);
    dailyNewPerformanceUsd = Math.round(
      (todayIntents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0) * 100,
    ) / 100;
  }

  return {
    personalPerformanceUsd,
    teamPerformanceUsd,
    dailyNewPerformanceUsd,
    smallAreaPerformanceUsd: areas.smallAreaUsd,
    smallAreaNewPerformanceUsd: areas.smallAreaNewUsd,
    largeAreaPerformanceUsd: areas.largeAreaUsd,
    largeAreaNewPerformanceUsd: areas.largeAreaNewUsd,
  };
}

/** Per-wallet stats for referral tree nodes (personal stake vs downline team volume). */
export async function fetchPartnerReferralNodeStats(
  sb: Sb,
  wallet: string,
): Promise<{
  personalPerformanceUsd: number;
  teamPerformanceUsd: number;
  teamCount: number;
}> {
  const [stats, downline] = await Promise.all([
    fetchPartnerTeamStats(sb, wallet),
    collectPartnerDownlineWallets(sb, wallet),
  ]);
  return {
    personalPerformanceUsd: stats.personalPerformanceUsd,
    teamPerformanceUsd: stats.teamPerformanceUsd,
    teamCount: downline.length,
  };
}

const PARTNER_JOIN_STATUSES = ['credited', 'completed', 'sweep_pending'];

/** Whether `candidateWallet` is anywhere under `sponsorWallet` in the partner referral tree. */
export async function isPartnerDownlineOf(
  sb: Sb,
  sponsorWallet: string,
  candidateWallet: string,
): Promise<boolean> {
  const sponsor = sponsorWallet.trim().toLowerCase();
  const candidate = candidateWallet.trim().toLowerCase();
  if (!sponsor || !candidate || sponsor === candidate) return false;
  const downline = await collectPartnerDownlineWallets(sb, sponsorWallet);
  return downline.some((w) => w.toLowerCase() === candidate);
}

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

async function isPartnerAccount(sb: Sb, wallet: string): Promise<boolean> {
  const { data } = await sb
    .from('partner_accounts')
    .select('is_partner')
    .eq('wallet_address', wallet)
    .maybeSingle();
  return Boolean(data?.is_partner);
}

/** Partner sponsors from depositor upward: [direct partner, second partner, …]. */
export async function getPartnerUplineChain(sb: Sb, depositorWallet: string): Promise<string[]> {
  const partners: string[] = [];
  let current = depositorWallet;
  const seen = new Set<string>();

  while (true) {
    const { data: ref } = await sb
      .from('referrals')
      .select('sponsor_wallet_address')
      .eq('wallet_address', current)
      .eq('referral_type', 'partner')
      .eq('status', 'active')
      .maybeSingle();
    const sponsor = ref?.sponsor_wallet_address as string | undefined;
    if (!sponsor) break;
    const key = sponsor.toLowerCase();
    if (seen.has(key)) break;
    seen.add(key);
    if (await isPartnerAccount(sb, sponsor)) partners.push(sponsor);
    current = sponsor;
  }
  return partners;
}

/** True when depositor sits under partner's small-area branches (excludes largest direct line). */
export async function isDepositorInPartnerSmallArea(
  sb: Sb,
  partnerWallet: string,
  depositorWallet: string,
): Promise<boolean> {
  const inDownline = await isPartnerDownlineOf(sb, partnerWallet, depositorWallet);
  if (!inDownline) return false;

  const directs = await fetchDirectPartnerReferrals(sb, partnerWallet);
  if (directs.length <= 1) return false;

  const lines = await Promise.all(
    directs.map(async (child) => ({
      wallet: child,
      teamUsd: await getBranchTeamVolume(sb, child),
    })),
  );
  const sorted = [...lines].sort((a, b) => b.teamUsd - a.teamUsd);
  const largeRoot = sorted[0]?.wallet;
  if (!largeRoot) return false;

  const largeSubtree = await collectPartnerDownlineWallets(sb, largeRoot);
  largeSubtree.push(largeRoot);
  const dep = depositorWallet.toLowerCase();
  return !largeSubtree.some((w) => w.toLowerCase() === dep);
}

export type PartnerSd3EventAllocation = {
  wallet: string;
  sd3: number;
  tierRatePct: number;
  role: 'direct' | 'upline';
  sourceWallet: string;
  eventAmountUsd: number;
  rewardSharePct: number;
  intentId?: string;
};

/** Allocate sD3 for one credited stake intent across partner uplines. */
export async function allocatePartnerSd3ForIntent(
  sb: Sb,
  depositorWallet: string,
  amountUsd: number,
  intentId?: string,
): Promise<PartnerSd3EventAllocation[]> {
  if (amountUsd <= 0) return [];
  const partners = await getPartnerUplineChain(sb, depositorWallet);
  if (!partners.length) return [];

  const directPartner = partners[0];
  if (!(await isDepositorInPartnerSmallArea(sb, directPartner, depositorWallet))) return [];

  const areas = await fetchPartnerAreaStats(sb, directPartner);
  const split = splitEventSd3(amountUsd, areas.smallAreaUsd);
  if (split.grossSd3 <= 0) return [];

  const tier = getBribeTier(areas.smallAreaUsd);
  if (!tier) return [];
  const directSharePct = Math.round(getBribeTierSplit(tier).directShare * 100);
  const uplineSharePct = Math.round(getBribeTierSplit(tier).uplineShare * 100);

  const out: PartnerSd3EventAllocation[] = [
    {
      wallet: directPartner,
      sd3: split.directSd3,
      tierRatePct: split.tierRatePct,
      role: 'direct',
      sourceWallet: depositorWallet,
      eventAmountUsd: amountUsd,
      rewardSharePct: directSharePct,
      intentId,
    },
  ];
  if (partners[1] && split.uplineSd3 > 0) {
    out.push({
      wallet: partners[1],
      sd3: split.uplineSd3,
      tierRatePct: split.tierRatePct,
      role: 'upline',
      sourceWallet: depositorWallet,
      eventAmountUsd: amountUsd,
      rewardSharePct: uplineSharePct,
      intentId,
    });
  }
  return out;
}

export type PartnerSd3AllocationRow = {
  recipientWallet: string;
  sourceWallet: string;
  settlementDate: string;
  intentId?: string;
  eventAmountUsd: number;
  tierRatePct: number;
  rewardSharePct: number;
  role: 'direct' | 'upline';
  sd3Amount: number;
};

export type PartnerDirectLineStat = {
  wallet: string;
  teamUsd: number;
  dailyNewUsd: number;
};

export async function fetchPartnerDirectLineStats(
  sb: Sb,
  wallet: string,
  dayStartIso = startOfSgtDayIso(),
  dayEndIso?: string,
): Promise<PartnerDirectLineStat[]> {
  const directs = await fetchDirectPartnerReferrals(sb, wallet);
  return Promise.all(
    directs.map(async (child) => ({
      wallet: child,
      teamUsd: await getBranchTeamVolume(sb, child),
      dailyNewUsd: await sumBranchDailyNew(sb, child, dayStartIso, dayEndIso),
    })),
  );
}

/** Collect per-wallet totals and per-event allocation rows for a settlement date. */
export async function collectPartnerSd3ForSettlementDate(
  sb: Sb,
  settlementDate: string,
): Promise<{
  byWallet: Map<string, { sd3: number; tierRatePct: number; smallAreaNewUsd: number }>;
  events: PartnerSd3AllocationRow[];
}> {
  const { startIso, endIso } = sgtDayBounds(settlementDate);
  const { data: intents } = await sb
    .from('stake_intents')
    .select('id, wallet_address, amount_usdt')
    .in('status', CREDITED_STATUSES)
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);

  const accum = new Map<string, { sd3: number; tierRatePct: number; smallAreaNewUsd: number }>();
  const events: PartnerSd3AllocationRow[] = [];

  for (const intent of intents ?? []) {
    const depositor = intent.wallet_address as string;
    const amount = Number(intent.amount_usdt ?? 0);
    const allocations = await allocatePartnerSd3ForIntent(
      sb,
      depositor,
      amount,
      intent.id as string,
    );
    for (const row of allocations) {
      const prev = accum.get(row.wallet) ?? { sd3: 0, tierRatePct: row.tierRatePct, smallAreaNewUsd: 0 };
      prev.sd3 = Math.round((prev.sd3 + row.sd3) * 100) / 100;
      prev.tierRatePct = row.tierRatePct;
      if (row.role === 'direct') prev.smallAreaNewUsd = Math.round((prev.smallAreaNewUsd + amount) * 100) / 100;
      accum.set(row.wallet, prev);
      events.push({
        recipientWallet: row.wallet,
        sourceWallet: row.sourceWallet,
        settlementDate,
        intentId: row.intentId,
        eventAmountUsd: row.eventAmountUsd,
        tierRatePct: row.tierRatePct,
        rewardSharePct: row.rewardSharePct,
        role: row.role,
        sd3Amount: row.sd3,
      });
    }
  }

  return { byWallet: accum, events };
}

/** @deprecated use collectPartnerSd3ForSettlementDate */
export async function sumPartnerSd3ForSettlementDate(
  sb: Sb,
  settlementDate: string,
): Promise<Map<string, { sd3: number; tierRatePct: number; smallAreaNewUsd: number }>> {
  const { byWallet } = await collectPartnerSd3ForSettlementDate(sb, settlementDate);
  return byWallet;
}
