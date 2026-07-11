import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  collectPartnerDownlineWallets,
  fetchDirectPartnerReferrals,
  fetchPartnerMemberWallets,
} from './partnerPerformance.ts';

type Sb = SupabaseClient;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sumPersonalPerformance(sb: Sb, wallet: string): Promise<number> {
  const { data: ownIntents } = await sb
    .from('stake_intents')
    .select('amount_usdt')
    .eq('wallet_address', wallet)
    .in('status', ['credited', 'completed', 'sweep_pending', 'sweeping']);
  return round2((ownIntents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0));
}

/** Branch volume = personal stake + all downline partner performance (each wallet counted once). */
export async function getPartnerBranchTeamVolume(sb: Sb, rootWallet: string): Promise<number> {
  const [personal, downlineVolume] = await Promise.all([
    sumPersonalPerformance(sb, rootWallet),
    sumDownlineReferralPerformance(sb, rootWallet),
  ]);
  return round2(personal + downlineVolume);
}

async function sumDownlineReferralPerformance(sb: Sb, wallet: string): Promise<number> {
  const downline = await collectPartnerDownlineWallets(sb, wallet);
  if (!downline.length) return 0;
  const { data: refs } = await sb
    .from('referrals')
    .select('performance_weight')
    .in('wallet_address', downline)
    .eq('referral_type', 'partner')
    .eq('status', 'active');
  return round2((refs ?? []).reduce((s, r) => s + Number(r.performance_weight ?? 0), 0));
}

/** 伞下合伙人业绩去重：每条直推合伙人线只计该线分支总量一次。 */
export async function computeDedupPartnerSubsidyPerformance(sb: Sb, wallet: string): Promise<number> {
  const directs = await fetchDirectPartnerReferrals(sb, wallet);
  if (!directs.length) return 0;
  const partnerSet = new Set(
    (await fetchPartnerMemberWallets(sb, directs)).map((w) => w.toLowerCase()),
  );
  let total = 0;
  for (const child of directs) {
    if (!partnerSet.has(child.toLowerCase())) continue;
    total += await getPartnerBranchTeamVolume(sb, child);
  }
  return round2(total);
}

async function isApprovedMarketLeader(sb: Sb, wallet: string): Promise<boolean> {
  const { data } = await sb
    .from('partner_accounts')
    .select('market_leader_status')
    .ilike('wallet_address', wallet)
    .maybeSingle();
  return data?.market_leader_status === 'approved';
}

/** Nearest market leader on path from `leaderWallet` up to `rootPartner` (exclusive). */
async function isTopmostMarketLeaderUnderPartner(
  sb: Sb,
  rootPartner: string,
  leaderWallet: string,
): Promise<boolean> {
  let current = leaderWallet;
  const root = rootPartner.toLowerCase();

  while (true) {
    const { data: ref } = await sb
      .from('referrals')
      .select('sponsor_wallet_address')
      .ilike('wallet_address', current)
      .eq('referral_type', 'partner')
      .eq('status', 'active')
      .maybeSingle();
    const sponsor = ref?.sponsor_wallet_address as string | undefined;
    if (!sponsor) return false;
    if (sponsor.toLowerCase() === root) return true;
    if (await isApprovedMarketLeader(sb, sponsor)) return false;
    current = sponsor;
  }
}

/** 伞下伞下市场领导人业绩去重：每条领导人线只计该领导人分支总量一次。 */
export async function computeDedupMarketLeaderSubsidyPerformance(
  sb: Sb,
  wallet: string,
): Promise<number> {
  const downline = await collectPartnerDownlineWallets(sb, wallet);
  if (!downline.length) return 0;

  const { data: leaderRows } = await sb
    .from('partner_accounts')
    .select('wallet_address')
    .in('wallet_address', downline)
    .eq('market_leader_status', 'approved');

  const leaders = (leaderRows ?? []).map((r) => r.wallet_address as string);
  if (!leaders.length) return 0;

  let total = 0;
  for (const leader of leaders) {
    if (await isTopmostMarketLeaderUnderPartner(sb, wallet, leader)) {
      total += await getPartnerBranchTeamVolume(sb, leader);
    }
  }
  return round2(total);
}

function activeTicketStatuses() {
  return ['open', 'pending_info', 'under_review', 'approved', 'paid'];
}

/** 伞下领导人已申请/占用的市场补贴，折算为应从合伙人可计算业绩中扣除的量。 */
export async function sumDownlineMarketSubsidyPerformanceDeduction(
  sb: Sb,
  partnerWallet: string,
  marketRatePct: number,
): Promise<number> {
  const rate = marketRatePct / 100;
  if (rate <= 0) return 0;
  const downline = await collectPartnerDownlineWallets(sb, partnerWallet);
  if (!downline.length) return 0;

  const { data: tickets } = await sb
    .from('partner_subsidy_tickets')
    .select('amount_usd')
    .eq('kind', 'market_subsidy')
    .in('wallet_address', downline)
    .in('status', activeTicketStatuses());

  const totalAmount = (tickets ?? []).reduce((s, t) => s + Number(t.amount_usd ?? 0), 0);
  return round2(totalAmount / rate);
}
