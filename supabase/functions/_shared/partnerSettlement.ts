import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  collectPartnerSd3ForSettlementDate,
  fetchPartnerAreaStats,
} from './partnerPerformance.ts';
import { yesterdaySgtDateString } from './partnerTimezone.ts';

type Sb = SupabaseClient;

export const DAILY_YIELD_PCT = 0.4;
export const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
export const STAKE_LOCK_DAYS = 540;

const CREDITED_STATUSES = ['credited', 'completed', 'sweep_pending', 'sweeping'];

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
    exit_multiplier: 6,
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

      const principal = Number(pos.principal_usdt ?? 0);
      const accruedSoFar = Number(pos.accrued_yield_usdt ?? 0);
      const exitMult = Number(pos.exit_multiplier ?? (pos.kind === 'sd3' ? 2 : 6));
      const exitCap = round4(principal * exitMult);
      if (accruedSoFar >= exitCap - 1e-9) {
        if (pos.status === 'active') {
          await sb
            .from('partner_stake_positions')
            .update({ status: 'closed', updated_at: new Date().toISOString() })
            .eq('id', pos.id);
        }
        continue;
      }

      const dailyFull = round4(Number(pos.daily_yield_usdt ?? 0));
      const yieldUsdt = round4(Math.min(dailyFull, exitCap - accruedSoFar));
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
          accrued_yield_usdt: round4(accruedSoFar + yieldUsdt),
          status: accruedSoFar + yieldUsdt >= exitCap - 1e-9 ? 'closed' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id);

      yieldRows++;
    }

    const { byWallet: sd3Allocations, events: sd3AllocationEvents } =
      await collectPartnerSd3ForSettlementDate(sb, dateStr);

    for (const [wallet, row] of sd3Allocations.entries()) {
      if (row.sd3 <= 0) continue;

      const { data: dup } = await sb
        .from('partner_sd3_settlements')
        .select('id')
        .eq('wallet_address', wallet)
        .eq('settlement_date', dateStr)
        .maybeSingle();
      if (dup) continue;

      const { data: partnerAcct } = await sb
        .from('partner_accounts')
        .select('is_partner')
        .eq('wallet_address', wallet)
        .maybeSingle();
      if (!partnerAcct?.is_partner) continue;

      const areas = await fetchPartnerAreaStats(sb, wallet);

      await sb.from('partner_sd3_settlements').insert({
        wallet_address: wallet,
        settlement_date: dateStr,
        team_performance_usd: areas.smallAreaUsd,
        daily_new_performance_usd: row.smallAreaNewUsd,
        tier_rate_pct: row.tierRatePct,
        sd3_amount: row.sd3,
      });

      const { data: acct } = await sb
        .from('partner_accounts')
        .select('sd3_balance, lifetime_sd3_earned')
        .eq('wallet_address', wallet)
        .single();

      await sb
        .from('partner_accounts')
        .update({
          sd3_balance: round4(Number(acct?.sd3_balance ?? 0) + row.sd3),
          lifetime_sd3_earned: round4(Number(acct?.lifetime_sd3_earned ?? 0) + row.sd3),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', wallet);

      sd3Rows++;
    }

    if (sd3AllocationEvents.length) {
      const { data: existingAlloc } = await sb
        .from('partner_sd3_allocations')
        .select('id')
        .eq('settlement_date', dateStr)
        .limit(1);
      if (!existingAlloc?.length) {
        await sb.from('partner_sd3_allocations').insert(
          sd3AllocationEvents.map((e) => ({
            recipient_wallet: e.recipientWallet,
            source_wallet: e.sourceWallet,
            settlement_date: e.settlementDate,
            intent_id: e.intentId ?? null,
            event_amount_usd: e.eventAmountUsd,
            tier_rate_pct: e.tierRatePct,
            reward_share_pct: e.rewardSharePct,
            role: e.role,
            sd3_amount: e.sd3Amount,
          })),
        );
      }
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

  /** After real settlement, advance demo umbrella (new members + settle prior pending). */
  try {
    const { runDemoPartnerDailyTick } = await import('./demoPartnerDailyTick.ts');
    await runDemoPartnerDailyTick(sb);
  } catch (e) {
    console.warn('[partner-settlement] demo tick skipped:', e instanceof Error ? e.message : e);
  }

  return { settlementDate: dateStr, yieldRows, sd3Rows, skipped: false };
}

export async function fetchPartnerAccountBundle(sb: Sb, wallet: string) {
  const w = wallet.trim();
  const { data: creditedIntents } = await sb
    .from('stake_intents')
    .select('id')
    .ilike('wallet_address', w)
    .in('status', CREDITED_STATUSES);
  for (const row of creditedIntents ?? []) {
    await syncStakePositionOnCredit(sb, row.id as string).catch(() => {});
  }

  const [account, positions, sd3History, sd3Allocations, yieldHistory, sd3Transfers] = await Promise.all([
    sb.from('partner_accounts').select('*').ilike('wallet_address', w).maybeSingle(),
    sb
      .from('partner_stake_positions')
      .select('*')
      .ilike('wallet_address', w)
      .eq('status', 'active')
      .order('started_at', { ascending: false }),
    sb
      .from('partner_sd3_settlements')
      .select('*')
      .ilike('wallet_address', w)
      .order('settlement_date', { ascending: false })
      .limit(30),
    sb
      .from('partner_sd3_allocations')
      .select('*')
      .ilike('recipient_wallet', w)
      .order('settlement_date', { ascending: false })
      .limit(100),
    sb
      .from('partner_yield_settlements')
      .select('*')
      .ilike('wallet_address', w)
      .order('settlement_date', { ascending: false })
      .limit(30),
    sb
      .from('partner_sd3_transfers')
      .select('*')
      .ilike('from_wallet', w)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return {
    account: account.data,
    stakePositions: positions.data ?? [],
    sd3Settlements: sd3History.data ?? [],
    sd3Allocations: sd3Allocations.data ?? [],
    yieldSettlements: yieldHistory.data ?? [],
    sd3Transfers: sd3Transfers.data ?? [],
  };
}

// Re-export for callers that imported calcDailySd3 from this module.
export { getBribeTier, calcDailySd3DirectShare as calcDailySd3 } from './partnerSd3Rules.ts';
