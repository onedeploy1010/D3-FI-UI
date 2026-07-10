import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchPartnerTeamStats } from './partnerPerformance.ts';
import { sgtDayBounds, yesterdaySgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

export const DAILY_YIELD_PCT = 0.4;
export const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
export const STAKE_LOCK_DAYS = 540;
export const BRIBE_TIER_MIN_USD = 1;

const BRIBE_TIERS = [
  { min: 1, max: 100_000, rate: 1, ratePct: 100 },
  { min: 100_000, max: 200_000, rate: 0.8, ratePct: 80 },
  { min: 200_000, max: 500_000, rate: 0.6, ratePct: 60 },
  { min: 500_000, max: 1_000_000, rate: 0.5, ratePct: 50 },
] as const;

const CREDITED_STATUSES = ['credited', 'completed', 'sweep_pending', 'sweeping'];

export function getBribeTier(teamPerformanceUsd: number) {
  if (teamPerformanceUsd < BRIBE_TIER_MIN_USD) return null;
  for (const tier of BRIBE_TIERS) {
    if (teamPerformanceUsd >= tier.min && teamPerformanceUsd < tier.max) return tier;
  }
  if (teamPerformanceUsd >= 1_000_000) return BRIBE_TIERS[BRIBE_TIERS.length - 1];
  return null;
}

export function calcDailySd3(
  teamPerformanceUsd: number,
  dailyNewPerformanceUsd: number,
  isPartner: boolean,
): { sd3: number; tierRatePct: number } {
  if (!isPartner || dailyNewPerformanceUsd <= 0) return { sd3: 0, tierRatePct: 0 };
  const tier = getBribeTier(teamPerformanceUsd);
  if (!tier) return { sd3: 0, tierRatePct: 0 };
  return {
    sd3: Math.round(dailyNewPerformanceUsd * tier.rate * 100) / 100,
    tierRatePct: tier.ratePct,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function ensurePartnerAccount(sb: Sb, walletAddress: string) {
  await sb.from('partner_accounts').upsert(
    { wallet_address: walletAddress },
    { onConflict: 'wallet_address', ignoreDuplicates: true },
  );
}

/** Create stake position when a deposit is credited. */
export async function syncStakePositionOnCredit(sb: Sb, intentId: string): Promise<void> {
  const { data: existing } = await sb
    .from('partner_stake_positions')
    .select('id')
    .eq('intent_id', intentId)
    .maybeSingle();
  if (existing) return;

  const { data: intent, error } = await sb
    .from('stake_intents')
    .select('id, wallet_address, intent_type, amount_usdt, status, updated_at, created_at')
    .eq('id', intentId)
    .maybeSingle();
  if (error || !intent) return;
  if (!CREDITED_STATUSES.includes(intent.status as string)) return;

  const wallet = intent.wallet_address as string;
  const principal = Number(intent.amount_usdt ?? 0);
  if (principal <= 0) return;

  await ensurePartnerAccount(sb, wallet);

  const startedAt = (intent.updated_at ?? intent.created_at) as string;
  const unlockAt = new Date(new Date(startedAt).getTime() + STAKE_LOCK_DAYS * 86400000).toISOString();
  const dailyYield = round4(principal * DAILY_YIELD_RATE);

  await sb.from('partner_stake_positions').insert({
    wallet_address: wallet,
    intent_id: intentId,
    kind: intent.intent_type,
    principal_usdt: principal,
    daily_yield_usdt: dailyYield,
    started_at: startedAt,
    unlock_at: unlockAt,
    status: 'active',
  });

  if (intent.intent_type === 'partner_join') {
    await sb
      .from('partner_accounts')
      .update({ is_partner: true, joined_at: startedAt, updated_at: new Date().toISOString() })
      .eq('wallet_address', wallet);
  }
}

/** Backfill positions for credited intents missing a stake row. */
export async function syncAllStakePositions(sb: Sb): Promise<number> {
  const { data: intents } = await sb
    .from('stake_intents')
    .select('id')
    .in('status', CREDITED_STATUSES);
  let synced = 0;
  for (const row of intents ?? []) {
    await syncStakePositionOnCredit(sb, row.id as string);
    synced++;
  }
  return synced;
}

async function sumDownlineNewPerformanceSgt(
  sb: Sb,
  wallet: string,
  settlementDate: string,
): Promise<number> {
  const downline: string[] = [];
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
      downline.push(addr);
      queue.push(addr);
    }
  }

  if (!downline.length) return 0;

  const { startIso, endIso } = sgtDayBounds(settlementDate);
  const { data: intents } = await sb
    .from('stake_intents')
    .select('amount_usdt')
    .in('wallet_address', downline)
    .in('status', CREDITED_STATUSES)
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);

  return round4((intents ?? []).reduce((s, r) => s + Number(r.amount_usdt ?? 0), 0));
}

export type PartnerSettlementResult = {
  settlementDate: string;
  yieldRows: number;
  sd3Rows: number;
  skipped: boolean;
};

export async function runDailyPartnerSettlement(
  sb: Sb,
  settlementDate?: string,
): Promise<PartnerSettlementResult> {
  const dateStr = settlementDate ?? yesterdaySgtDateString();

  const { data: prior } = await sb
    .from('partner_settlement_runs')
    .select('settlement_date')
    .eq('settlement_date', dateStr)
    .maybeSingle();
  if (prior) {
    return { settlementDate: dateStr, yieldRows: 0, sd3Rows: 0, skipped: true };
  }

  await syncAllStakePositions(sb);

  await sb.from('partner_settlement_runs').insert({
    settlement_date: dateStr,
    status: 'running',
    yield_rows: 0,
    sd3_rows: 0,
  });

  let yieldRows = 0;
  let sd3Rows = 0;

  try {
    const settlementEnd = new Date(`${dateStr}T23:59:59.999+08:00`);

    const { data: positions } = await sb
      .from('partner_stake_positions')
      .select('*')
      .eq('status', 'active');

    for (const pos of positions ?? []) {
      const started = new Date(pos.started_at as string);
      const unlock = new Date(pos.unlock_at as string);
      if (started > settlementEnd) continue;
      if (unlock <= new Date(`${dateStr}T00:00:00+08:00`)) continue;

      const { data: dup } = await sb
        .from('partner_yield_settlements')
        .select('id')
        .eq('position_id', pos.id)
        .eq('settlement_date', dateStr)
        .maybeSingle();
      if (dup) continue;

      const yieldUsdt = round4(Number(pos.daily_yield_usdt ?? 0));
      if (yieldUsdt <= 0) continue;

      const wallet = pos.wallet_address as string;
      await ensurePartnerAccount(sb, wallet);

      await sb.from('partner_yield_settlements').insert({
        wallet_address: wallet,
        position_id: pos.id,
        settlement_date: dateStr,
        principal_usdt: pos.principal_usdt,
        daily_rate_pct: DAILY_YIELD_PCT,
        yield_usdt: yieldUsdt,
      });

      const { data: acct } = await sb
        .from('partner_accounts')
        .select('pending_usdt_yield, lifetime_usdt_yield')
        .eq('wallet_address', wallet)
        .single();

      await sb
        .from('partner_accounts')
        .update({
          pending_usdt_yield: round4(Number(acct?.pending_usdt_yield ?? 0) + yieldUsdt),
          lifetime_usdt_yield: round4(Number(acct?.lifetime_usdt_yield ?? 0) + yieldUsdt),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', wallet);

      await sb
        .from('partner_stake_positions')
        .update({
          accrued_yield_usdt: round4(Number(pos.accrued_yield_usdt ?? 0) + yieldUsdt),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id);

      yieldRows++;
    }

    const { data: partners } = await sb
      .from('partner_accounts')
      .select('wallet_address')
      .eq('is_partner', true);

    for (const partner of partners ?? []) {
      const wallet = partner.wallet_address as string;

      const { data: dup } = await sb
        .from('partner_sd3_settlements')
        .select('id')
        .eq('wallet_address', wallet)
        .eq('settlement_date', dateStr)
        .maybeSingle();
      if (dup) continue;

      const stats = await fetchPartnerTeamStats(sb, wallet);
      const dailyNew = await sumDownlineNewPerformanceSgt(sb, wallet, dateStr);
      const { sd3, tierRatePct } = calcDailySd3(stats.teamPerformanceUsd, dailyNew, true);
      if (sd3 <= 0) continue;

      await sb.from('partner_sd3_settlements').insert({
        wallet_address: wallet,
        settlement_date: dateStr,
        team_performance_usd: stats.teamPerformanceUsd,
        daily_new_performance_usd: dailyNew,
        tier_rate_pct: tierRatePct,
        sd3_amount: sd3,
      });

      const { data: acct } = await sb
        .from('partner_accounts')
        .select('sd3_balance, lifetime_sd3_earned')
        .eq('wallet_address', wallet)
        .single();

      await sb
        .from('partner_accounts')
        .update({
          sd3_balance: round4(Number(acct?.sd3_balance ?? 0) + sd3),
          lifetime_sd3_earned: round4(Number(acct?.lifetime_sd3_earned ?? 0) + sd3),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', wallet);

      sd3Rows++;
    }

    await sb
      .from('partner_settlement_runs')
      .update({
        status: 'completed',
        yield_rows: yieldRows,
        sd3_rows: sd3Rows,
        ran_at: new Date().toISOString(),
      })
      .eq('settlement_date', dateStr);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await sb
      .from('partner_settlement_runs')
      .update({
        status: 'failed',
        error_message: errorMessage.slice(0, 500),
        yield_rows: yieldRows,
        sd3_rows: sd3Rows,
        ran_at: new Date().toISOString(),
      })
      .eq('settlement_date', dateStr);
    throw e;
  }

  return { settlementDate: dateStr, yieldRows, sd3Rows, skipped: false };
}

export async function fetchPartnerAccountBundle(sb: Sb, wallet: string) {
  const [account, positions, sd3History, yieldHistory] = await Promise.all([
    sb.from('partner_accounts').select('*').eq('wallet_address', wallet).maybeSingle(),
    sb
      .from('partner_stake_positions')
      .select('*')
      .eq('wallet_address', wallet)
      .eq('status', 'active')
      .order('started_at', { ascending: false }),
    sb
      .from('partner_sd3_settlements')
      .select('*')
      .eq('wallet_address', wallet)
      .order('settlement_date', { ascending: false })
      .limit(30),
    sb
      .from('partner_yield_settlements')
      .select('*')
      .eq('wallet_address', wallet)
      .order('settlement_date', { ascending: false })
      .limit(30),
  ]);

  return {
    account: account.data,
    stakePositions: positions.data ?? [],
    sd3Settlements: sd3History.data ?? [],
    yieldSettlements: yieldHistory.data ?? [],
  };
}
