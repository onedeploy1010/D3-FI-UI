import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { toSgtDateString, yesterdaySgtDateString } from './partnerTimezone.ts';
import { getD3PriceUsdt, usdtToD3 } from './d3Price.ts';
import { HttpError } from './wallet.ts';

type Sb = SupabaseClient;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * V-11: A caller-supplied settlement date must be a valid YYYY-MM-DD and must NOT
 * be in the future relative to today in SGT. Settling a future date would credit
 * yield that has not yet accrued. Pure/testable: `todaySgt` is injected.
 */
export function assertSettlementDateNotFuture(date: string, todaySgt: string): void {
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    throw new HttpError(400, 'settlementDate must be YYYY-MM-DD');
  }
  // Reject impossible calendar dates (e.g. 2026-13-40) that pass the regex.
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime()) || toSgtDateString(parsed) !== date) {
    throw new HttpError(400, 'settlementDate must be a valid date');
  }
  // Lexicographic compare is correct for zero-padded ISO dates.
  if (date > todaySgt) {
    throw new HttpError(400, 'settlementDate must not be in the future');
  }
}

export const DAILY_YIELD_PCT = 0.4;
export const DAILY_YIELD_RATE = DAILY_YIELD_PCT / 100;
export const STAKE_LOCK_DAYS = 540;
/** USDT stake exits at 6x principal; UD3 re-stake exits at 2x. */
export const EXIT_MULTIPLIER_USDT = 6;
export const EXIT_MULTIPLIER_UD3 = 2;

const CREDITED_STATUSES = ['credited', 'completed', 'sweep_pending', 'sweeping'];

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function exitMultiplierForKind(kind: unknown): number {
  return kind === 'ud3' || kind === 'sd3' ? EXIT_MULTIPLIER_UD3 : EXIT_MULTIPLIER_USDT;
}

/**
 * Ensure a position row carries its D3-denominated fields. Legacy rows created
 * before migration 027 (or before this code) get backfilled from principal at
 * the given price (best-effort: original stake price is unknown for legacy rows).
 * Returns the resolved D3 fields.
 */
function resolvePositionD3(
  pos: Record<string, unknown>,
  d3Price: number,
): { stakedD3: number; dailyReleaseD3: number; exitCapD3: number; releasedD3: number; priceAtStake: number } {
  const principal = Number(pos.principal_usdt ?? 0);
  const priceAtStake = Number(pos.d3_price_at_stake ?? 0) > 0 ? Number(pos.d3_price_at_stake) : d3Price;
  const stakedD3 = Number(pos.staked_d3 ?? 0) > 0 ? Number(pos.staked_d3) : usdtToD3(principal, priceAtStake);
  const dailyReleaseD3 =
    Number(pos.daily_release_d3 ?? 0) > 0
      ? Number(pos.daily_release_d3)
      : usdtToD3(round4(principal * DAILY_YIELD_RATE), priceAtStake);
  const exitMult = exitMultiplierForKind(pos.kind);
  const exitCapD3 = Number(pos.exit_cap_d3 ?? 0) > 0 ? Number(pos.exit_cap_d3) : round6(stakedD3 * exitMult);
  const releasedD3 = Number(pos.released_d3 ?? 0);
  return { stakedD3, dailyReleaseD3, exitCapD3, releasedD3, priceAtStake };
}

async function ensurePartnerAccount(sb: Sb, walletAddress: string) {
  await sb.from('partner_accounts').upsert(
    { wallet_address: walletAddress },
    { onConflict: 'wallet_address', ignoreDuplicates: true },
  );
}

/**
 * NEW-1 (HIGH): persist a settlement's daily D3 release ATOMICALLY.
 *
 * `pending_d3_yield` is a spendable balance that is DEBITED atomically at withdraw
 * time (034 `debit_pending_d3_yield`). Crediting it here with a read-modify-write
 * (SELECT balance; UPDATE balance+delta) races that debit: a debit landing between
 * our read and write is clobbered by the stale write-back -> lost update -> the user
 * keeps yield they already withdrew (double-spend). So the pending_d3_yield credit
 * goes through the atomic `credit_pending_d3_yield` RPC (single UPDATE ... += under a
 * row lock). The remaining columns — `lifetime_d3_yield` (monotonic counter),
 * `pending_usdt_yield` / `lifetime_usdt_yield` (best-effort USDT audit figures) — are
 * NOT atomic-debit targets, so a plain update is fine; pending_d3_yield is deliberately
 * NEVER written in that update (the RPC owns it).
 */
export async function creditSettlementYield(
  sb: Sb,
  wallet: string,
  releaseD3: number,
  releaseValueUsdt: number,
): Promise<void> {
  // Atomic spendable-balance credit (credit-first; provision the row and retry once
  // if it does not exist yet — case-insensitive so an existing mixed-case row is hit).
  const { error: creditErr } = await sb.rpc('credit_pending_d3_yield', {
    p_wallet: wallet,
    p_amount: releaseD3,
  });
  if (creditErr) {
    const msg = creditErr.message ?? '';
    if (msg.includes('ACCOUNT_NOT_FOUND') || msg.includes('RECIPIENT_NOT_FOUND')) {
      await ensurePartnerAccount(sb, wallet);
      const { error: retryErr } = await sb.rpc('credit_pending_d3_yield', {
        p_wallet: wallet,
        p_amount: releaseD3,
      });
      if (retryErr) throw retryErr;
    } else {
      throw creditErr;
    }
  }

  // Non-spendable counters + USDT audit figures. pending_d3_yield is intentionally
  // absent here — it is owned by the atomic RPC above (no read-modify-write on it).
  const { data: acct } = await sb
    .from('partner_accounts')
    .select('lifetime_d3_yield, pending_usdt_yield, lifetime_usdt_yield')
    .eq('wallet_address', wallet)
    .single();

  await sb
    .from('partner_accounts')
    .update({
      lifetime_d3_yield: round6(Number(acct?.lifetime_d3_yield ?? 0) + releaseD3),
      pending_usdt_yield: round4(Number(acct?.pending_usdt_yield ?? 0) + releaseValueUsdt),
      lifetime_usdt_yield: round4(Number(acct?.lifetime_usdt_yield ?? 0) + releaseValueUsdt),
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_address', wallet);
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

  // D3-denominated fields (price locked at stake time). USDT stake => 6x exit.
  const d3Price = await getD3PriceUsdt(sb);
  const stakedD3 = usdtToD3(principal, d3Price);
  const dailyReleaseD3 = usdtToD3(dailyYield, d3Price);
  const exitCapD3 = round6(stakedD3 * EXIT_MULTIPLIER_USDT);

  await sb.from('partner_stake_positions').insert({
    wallet_address: wallet,
    intent_id: intentId,
    kind: intent.intent_type,
    principal_usdt: principal,
    daily_yield_usdt: dailyYield,
    started_at: startedAt,
    unlock_at: unlockAt,
    status: 'active',
    exit_multiplier: EXIT_MULTIPLIER_USDT,
    staked_d3: stakedD3,
    d3_price_at_stake: d3Price,
    daily_release_d3: dailyReleaseD3,
    released_d3: 0,
    exit_cap_d3: exitCapD3,
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
  ud3Rows: number;
  skipped: boolean;
  /** R-7: recipients whose settle_pending_ud3 failed this run (rows left unsettled to retry). */
  ud3FailedWallets?: string[];
};

export type Ud3LedgerRow = { id: string; recipient_wallet: string };

/**
 * R-7: UD3 two-phase settlement — for each recipient move pending_ud3 into ud3_balance
 * via the atomic `settle_pending_ud3` RPC, then flip that recipient's unsettled ledger
 * rows to settled=true.
 *
 * The key invariant: a recipient's ledger rows are marked settled=true ONLY when its
 * settle_pending_ud3 SUCCEEDED. Previously the loop flagged every selected row settled
 * unconditionally, so a failed settle left the reward stuck in pending_ud3 yet marked the
 * rows settled — never retried, user under-credited. On failure we log, record the wallet,
 * and leave its rows settled=false so the next daily run retries them.
 *
 * Pure w.r.t. amounts (it does not change any credited amount) and testable with an
 * inline fake sb: rows are grouped by recipient, then only succeeded recipients' ids
 * are passed to the settled-update.
 */
export async function settleUd3Ledger(
  sb: Sb,
  ledgerRows: Ud3LedgerRow[],
  dateStr: string,
): Promise<{ settledRows: number; failedWallets: string[] }> {
  // Group ledger row ids by their (lowercased) recipient so we can flip ONLY the rows
  // whose settle_pending_ud3 call succeeded.
  const idsByRecipient = new Map<string, string[]>();
  for (const row of ledgerRows) {
    const w = (row.recipient_wallet as string).toLowerCase();
    const list = idsByRecipient.get(w);
    if (list) list.push(row.id as string);
    else idsByRecipient.set(w, [row.id as string]);
  }

  const settledIds: string[] = [];
  const failedWallets: string[] = [];
  for (const [w, ids] of idsByRecipient) {
    const { error: settleErr } = await sb.rpc('settle_pending_ud3', { p_wallet: w });
    if (settleErr) {
      // Leave this wallet's ledger rows settled=false so the next daily run retries.
      console.error('[ud3] settle_pending_ud3:', settleErr.message);
      failedWallets.push(w);
      continue;
    }
    for (const id of ids) settledIds.push(id);
  }

  if (settledIds.length > 0) {
    const nowIso = new Date().toISOString();
    for (let i = 0; i < settledIds.length; i += 500) {
      await sb
        .from('partner_ud3_ledger')
        .update({ settled: true, settled_at: nowIso, settlement_date: dateStr })
        .in('id', settledIds.slice(i, i + 500));
    }
  }

  return { settledRows: settledIds.length, failedWallets };
}

export async function runDailyPartnerSettlement(
  sb: Sb,
  settlementDate?: string,
): Promise<PartnerSettlementResult> {
  if (settlementDate !== undefined) {
    assertSettlementDateNotFuture(settlementDate, toSgtDateString());
  }
  const dateStr = settlementDate ?? yesterdaySgtDateString();

  const { data: prior } = await sb
    .from('partner_settlement_runs')
    .select('settlement_date')
    .eq('settlement_date', dateStr)
    .maybeSingle();
  if (prior) {
    return { settlementDate: dateStr, yieldRows: 0, ud3Rows: 0, skipped: true };
  }

  await syncAllStakePositions(sb);

  await sb.from('partner_settlement_runs').insert({
    settlement_date: dateStr,
    status: 'running',
    yield_rows: 0,
    sd3_rows: 0,
  });

  let yieldRows = 0;
  let ud3Rows = 0;
  let ud3FailedWallets: string[] = [];

  try {
    const settlementEnd = new Date(`${dateStr}T23:59:59.999+08:00`);
    const d3Price = await getD3PriceUsdt(sb);

    const { data: positions } = await sb
      .from('partner_stake_positions')
      .select('*')
      .eq('status', 'active');

    for (const pos of positions ?? []) {
      const started = new Date(pos.started_at as string);
      if (started > settlementEnd) continue;
      // Rule B: no 540-day cutoff — a position releases until the VALUE-based exit cap
      // (principal × 6 for USDT, × 2 for UD3) is reached. unlock_at is display-only.

      const { data: dup } = await sb
        .from('partner_yield_settlements')
        .select('id')
        .eq('position_id', pos.id)
        .eq('settlement_date', dateStr)
        .maybeSingle();
      if (dup) continue;

      // ── Value-based exit (rule B): release the daily D3 quantity, valued at the
      // CURRENT day price, until cumulative VALUE reaches principal × exit_multiplier.
      // accrued_yield_usdt = authoritative cumulative released VALUE (drives exit). ──
      const d3 = resolvePositionD3(pos as Record<string, unknown>, d3Price);
      const principalUsdt = Number(pos.principal_usdt ?? 0);
      const exitCapUsdt = round4(principalUsdt * exitMultiplierForKind(pos.kind));
      const accruedUsdt = Number(pos.accrued_yield_usdt ?? 0);
      if (accruedUsdt >= exitCapUsdt - 1e-6) {
        if (pos.status === 'active') {
          await sb
            .from('partner_stake_positions')
            .update({ status: 'closed', updated_at: new Date().toISOString() })
            .eq('id', pos.id);
        }
        continue;
      }

      const remainingUsdt = round4(exitCapUsdt - accruedUsdt);
      const fullDayValueUsdt = round4(d3.dailyReleaseD3 * d3Price);
      let releaseD3: number;
      let releaseValueUsdt: number;
      if (fullDayValueUsdt <= remainingUsdt) {
        releaseD3 = d3.dailyReleaseD3;
        releaseValueUsdt = fullDayValueUsdt;
      } else {
        // Final partial day — cap value exactly at the 6×/2× ceiling.
        releaseValueUsdt = remainingUsdt;
        releaseD3 = d3Price > 0 ? round6(remainingUsdt / d3Price) : 0;
      }
      if (releaseD3 <= 0 || releaseValueUsdt <= 0) continue;

      const nextAccruedUsdt = round4(accruedUsdt + releaseValueUsdt);
      const nextReleasedD3 = round6(d3.releasedD3 + releaseD3);
      const closed = nextAccruedUsdt >= exitCapUsdt - 1e-6;

      const wallet = pos.wallet_address as string;
      await ensurePartnerAccount(sb, wallet);

      await sb.from('partner_yield_settlements').insert({
        wallet_address: wallet,
        position_id: pos.id,
        settlement_date: dateStr,
        principal_usdt: pos.principal_usdt,
        daily_rate_pct: DAILY_YIELD_PCT,
        yield_usdt: releaseValueUsdt,
        yield_d3: releaseD3,
        d3_price: d3Price,
      });

      // NEW-1: credit the spendable pending_d3_yield ATOMICALLY (see creditSettlementYield);
      // the read-modify-write here previously clobbered concurrent atomic withdraw debits.
      await creditSettlementYield(sb, wallet, releaseD3, releaseValueUsdt);

      await sb
        .from('partner_stake_positions')
        .update({
          released_d3: nextReleasedD3,
          staked_d3: d3.stakedD3,
          d3_price_at_stake: d3.priceAtStake,
          daily_release_d3: d3.dailyReleaseD3,
          exit_cap_d3: d3.exitCapD3,
          accrued_yield_usdt: nextAccruedUsdt,
          status: closed ? 'closed' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id);

      yieldRows++;
    }

    // ── UD3 (反向金) two-phase settlement (043) ───────────────────────────────
    // Rewards accrue to pending_ud3 at deposit time (tryAllocateUd3ForCreditedIntent)
    // and become spendable ONLY here, at the daily SGT-midnight run: move each
    // recipient's pending_ud3 into ud3_balance and flip their unsettled ledger rows
    // to settled. This is what makes the reward show as 已结算 (and stake-able).
    {
      const { data: pendingLedger } = await sb
        .from('partner_ud3_ledger')
        .select('id, recipient_wallet')
        .eq('settled', false)
        .neq('role', 'reserve');
      // R-7: only mark a recipient's rows settled=true when its settle_pending_ud3
      // succeeded; failed wallets keep settled=false so the next daily run retries.
      const { settledRows, failedWallets } = await settleUd3Ledger(
        sb,
        (pendingLedger ?? []) as Ud3LedgerRow[],
        dateStr,
      );
      ud3Rows = settledRows;
      ud3FailedWallets = failedWallets;
    }

    await sb
      .from('partner_settlement_runs')
      .update({
        status: 'completed',
        yield_rows: yieldRows,
        sd3_rows: ud3Rows,
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
        sd3_rows: ud3Rows,
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

  if (ud3FailedWallets.length > 0) {
    console.error('[ud3] settle_pending_ud3 failed for wallets (left unsettled to retry):', ud3FailedWallets);
  }

  return {
    settlementDate: dateStr,
    yieldRows,
    ud3Rows,
    skipped: false,
    ...(ud3FailedWallets.length > 0 ? { ud3FailedWallets } : {}),
  };
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

  const [account, positions, ud3History, ud3Ledger, yieldHistory, ud3Transfers, yieldWithdrawals] = await Promise.all([
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
    // UD3 reward list = the new reverse-gold ledger (partner_ud3_ledger). The old
    // partner_sd3_allocations table is unused by the current engine, which left the
    // "UD3 奖励列表" empty even though the account balance reflected the reward.
    sb
      .from('partner_ud3_ledger')
      .select('*')
      .ilike('recipient_wallet', w)
      .neq('role', 'reserve')
      .order('created_at', { ascending: false })
      .limit(100),
    sb
      .from('partner_yield_settlements')
      .select('*')
      .ilike('wallet_address', w)
      .order('settlement_date', { ascending: false })
      .limit(30),
    sb
      .from('partner_ud3_transfers')
      .select('*')
      .ilike('from_wallet', w)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50),
    // Flash-swap (yield withdraw) history — ALL statuses so pending/failed swaps are
    // visible (a failed on-chain payout must not silently vanish from the history).
    sb
      .from('partner_yield_withdrawals')
      .select('*')
      .ilike('wallet_address', w)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Enrich each ledger row with its generating event (who deposited, how much, tier)
  // and shape it into the allocation-history rows the client already renders.
  const ledgerRows = ud3Ledger.data ?? [];
  const eventIds = [...new Set(ledgerRows.map((r) => r.event_id).filter(Boolean))];
  let eventsById: Record<string, Record<string, unknown>> = {};
  if (eventIds.length > 0) {
    const { data: evs } = await sb
      .from('partner_ud3_events')
      .select('id, depositor_wallet, deposit_usdt, tier_rate_pct')
      .in('id', eventIds);
    eventsById = Object.fromEntries((evs ?? []).map((e) => [e.id as string, e]));
  }
  const ud3Allocations = ledgerRows.map((r) => {
    const ev = eventsById[r.event_id as string] ?? {};
    return {
      id: r.id,
      recipient_wallet: r.recipient_wallet,
      // Show when it settled if already settled, else when it was generated.
      settlement_date: (r.settled ? r.settled_at : null) ?? r.created_at,
      event_amount_usd: Number(ev.deposit_usdt ?? 0),
      tier_rate_pct: Number(ev.tier_rate_pct ?? 0),
      // Direct reward is the fixed 60% cut; network (级差) rewards carry their gap %.
      reward_share_pct: r.role === 'direct' ? 60 : Number(r.gap_pct ?? r.v_share_pct ?? 0),
      // The client renders only 'direct' vs 'upline' (isDirect = role !== 'upline').
      // Map the ledger's 'differential' role to 'upline' so 级差 rewards aren't
      // mislabeled 直推 with the direct 60% formula.
      role: r.role === 'direct' ? 'direct' : 'upline',
      source_wallet: ev.depositor_wallet ?? null,
      sd3_amount: Number(r.ud3_amount ?? 0),
      // Two-phase (043): false until the daily SGT-midnight run settles it.
      settled: r.settled === true,
    };
  });

  return {
    account: account.data,
    stakePositions: positions.data ?? [],
    ud3Settlements: ud3History.data ?? [],
    ud3Allocations,
    yieldSettlements: yieldHistory.data ?? [],
    ud3Transfers: ud3Transfers.data ?? [],
    yieldWithdrawals: yieldWithdrawals.data ?? [],
  };
}
