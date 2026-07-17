import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { computeSolvency as realComputeSolvency } from './solvency.ts';
import { notify as realNotify } from './notifier.ts';
import { raiseAlert, type AlertInput } from './securityAlerts.ts';
import { reapExpiredNonces } from './siwe.ts';

type Sb = SupabaseClient;

/** Minimal solvency shape the monitor depends on (subset of SolvencyReport). */
type SolvencySlice = {
  ratio: number;
  minRatio: number;
  liabilityUsdt: number;
  flashSwapReserveUsdt: number;
  healthy: boolean;
};

/** Injectable so tests avoid chain RPC (solvency) and network (notify). */
export type MonitorDeps = {
  computeSolvency: (sb: Sb) => Promise<SolvencySlice>;
  notify: (alert: AlertInput) => Promise<unknown>;
};

const DEFAULT_DEPS: MonitorDeps = {
  computeSolvency: realComputeSolvency as unknown as (sb: Sb) => Promise<SolvencySlice>,
  notify: realNotify,
};

/** Deposit-count-per-hour ceiling before we flag a burst. Env-overridable. */
function depositHourlyCountThreshold(): number {
  const raw = Deno.env.get('SECURITY_DEPOSIT_HOURLY_COUNT_MAX');
  const n = raw ? Number(raw) : 500;
  return Number.isFinite(n) && n > 0 ? n : 500;
}

const DEFAULT_PLATFORM_HOURLY_USDT = 50000;

export type ScanSummary = {
  scannedAt: string;
  raised: string[]; // rule_ids of newly-created alerts
  notified: string[]; // rule_ids that were pushed (or attempted) via notifier
  autoPaused: string[]; // circuit-breaker flags auto-paused this scan
  noncesReaped: number; // expired siwe_nonces rows deleted this scan (housekeeping)
  errors: Array<{ rule: string; message: string }>;
};

/**
 * Run every monitoring rule against current state. Each rule is fail-soft: a
 * read error in one rule is recorded and does not abort the remaining rules.
 * De-duplicated alerts are written to security_alerts; newly-created ones whose
 * severity meets the notifier threshold are pushed.
 */
export async function runSecurityScan(sb: Sb, deps: MonitorDeps = DEFAULT_DEPS): Promise<ScanSummary> {
  const summary: ScanSummary = {
    scannedAt: new Date().toISOString(),
    raised: [],
    notified: [],
    autoPaused: [],
    noncesReaped: 0,
    errors: [],
  };

  /** Raise (dedup) and, if newly created, notify. Notifier failures are swallowed. */
  const emit = async (input: AlertInput): Promise<void> => {
    const { created } = await raiseAlert(sb, input);
    if (!created) return;
    summary.raised.push(input.ruleId);
    try {
      await deps.notify(input);
      summary.notified.push(input.ruleId);
    } catch (e) {
      summary.errors.push({ rule: `${input.ruleId}:notify`, message: msg(e) });
    }
  };

  const record = (rule: string, e: unknown) => summary.errors.push({ rule, message: msg(e) });

  // ── Rule P0: solvency breach → alert + auto-pause flash_swap ────────────────
  try {
    const rep = await deps.computeSolvency(sb);
    const ratio = Number(rep.ratio);
    const minRatio = Number(rep.minRatio);
    // ratio === -1 (or non-finite) is the "no liability / infinite coverage"
    // sentinel from computeSolvency → nothing to be insolvent against → skip.
    const breach = Number.isFinite(ratio) && ratio >= 0 && ratio < minRatio;
    if (breach) {
      let autoPaused = false;
      try {
        const { error } = await sb
          .from('system_pause_flags')
          .update({ paused: true, reason: 'auto: solvency breach', updated_at: new Date().toISOString() })
          .eq('flag', 'flash_swap');
        if (error) throw error;
        autoPaused = true;
        summary.autoPaused.push('flash_swap');
      } catch (e) {
        record('solvency_breach:auto_pause', e);
      }
      await emit({
        severity: 'P0',
        ruleId: 'solvency_breach',
        title: 'Solvency ratio below minimum — flash-swap reserve insufficient',
        detail: {
          ratio,
          minRatio,
          liabilityUsdt: rep.liabilityUsdt,
          flashSwapReserveUsdt: rep.flashSwapReserveUsdt,
        },
        entityType: 'solvency',
        autoPaused,
      });
    }
  } catch (e) {
    record('solvency_breach', e);
  }

  // ── Rule P1: platform hourly withdrawal volume over cap ─────────────────────
  try {
    const cap = await loadHourlyCap(sb);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from('partner_yield_withdrawals')
      .select('net_amount_usdt')
      .gte('created_at', hourAgo);
    if (error) throw error;
    let total = 0;
    for (const r of (data ?? []) as Array<{ net_amount_usdt?: unknown }>) {
      total += Number(r.net_amount_usdt ?? 0);
    }
    total = Math.round(total * 1e6) / 1e6;
    if (total > cap) {
      await emit({
        severity: 'P1',
        ruleId: 'platform_hourly_volume',
        title: 'Platform hourly withdrawal volume over limit',
        detail: { totalUsdt: total, capUsdt: cap },
        entityType: 'withdrawals',
      });
    }
  } catch (e) {
    record('platform_hourly_volume', e);
  }

  // ── Rule P1: D3 price stale / swung ─────────────────────────────────────────
  try {
    const { data, error } = await sb
      .from('d3_price_settings')
      .select('price_usdt, previous_price_usdt, max_deviation_pct, expires_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const row = data as {
        price_usdt?: unknown;
        previous_price_usdt?: unknown;
        max_deviation_pct?: unknown;
        expires_at?: unknown;
      };
      if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) {
        await emit({
          severity: 'P1',
          ruleId: 'd3_price_stale',
          title: 'D3 price is stale (past expires_at)',
          detail: { expiresAt: row.expires_at },
          entityType: 'd3_price',
        });
      }
      const price = Number(row.price_usdt);
      const prev = Number(row.previous_price_usdt);
      const maxDev = Number(row.max_deviation_pct);
      if (Number.isFinite(price) && Number.isFinite(prev) && prev > 0 && Number.isFinite(maxDev) && maxDev > 0) {
        const deviationPct = Math.abs(price - prev) / prev * 100;
        if (deviationPct > maxDev) {
          await emit({
            severity: 'P1',
            ruleId: 'd3_price_swing',
            title: 'D3 price deviation exceeds allowed threshold',
            detail: {
              price,
              previousPrice: prev,
              deviationPct: Math.round(deviationPct * 100) / 100,
              maxDeviationPct: maxDev,
            },
            entityType: 'd3_price',
          });
        }
      }
    }
  } catch (e) {
    record('d3_price', e);
  }

  // ── Rule P1: deposit anomaly (duplicate tx_hash / burst) ────────────────────
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hourAgoMs = Date.now() - 60 * 60 * 1000;
    const { data, error } = await sb
      .from('deposit_records')
      .select('tx_hash, created_at')
      .gte('created_at', dayAgo);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ tx_hash?: unknown; created_at?: unknown }>;

    // Duplicate tx_hash within the window = near-miss of the unique deposit guard.
    const counts = new Map<string, number>();
    let hourlyCount = 0;
    for (const r of rows) {
      const h = r.tx_hash != null ? String(r.tx_hash).toLowerCase() : '';
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
      if (r.created_at && new Date(String(r.created_at)).getTime() >= hourAgoMs) hourlyCount++;
    }
    const duplicates = [...counts.entries()].filter(([, c]) => c > 1).map(([h]) => h);
    if (duplicates.length > 0) {
      await emit({
        severity: 'P1',
        ruleId: 'deposit_duplicate_tx',
        title: 'Duplicate deposit tx_hash detected (unique-guard near-miss)',
        detail: { duplicateCount: duplicates.length, sample: duplicates.slice(0, 5) },
        entityType: 'deposits',
      });
    }

    const threshold = depositHourlyCountThreshold();
    if (hourlyCount > threshold) {
      await emit({
        severity: 'P1',
        ruleId: 'deposit_burst',
        title: 'Deposit count in last hour above threshold',
        detail: { hourlyCount, threshold },
        entityType: 'deposits',
      });
    }
  } catch (e) {
    record('deposit_anomaly', e);
  }

  // ── Rule P2: admin approvals awaiting a second admin ────────────────────────
  try {
    const { data, error } = await sb
      .from('admin_action_approvals')
      .select('id')
      .eq('status', 'pending');
    if (error) throw error;
    const pending = (data ?? []) as Array<unknown>;
    if (pending.length > 0) {
      await emit({
        severity: 'P2',
        ruleId: 'admin_pending_approvals',
        title: 'Admin actions awaiting a second-admin approval',
        detail: { pendingCount: pending.length },
        entityType: 'approvals',
      });
    }
  } catch (e) {
    record('admin_pending_approvals', e);
  }

  // ── Info P3: any circuit-breaker currently engaged ──────────────────────────
  try {
    const { data, error } = await sb
      .from('system_pause_flags')
      .select('flag, paused')
      .eq('paused', true);
    if (error) throw error;
    const paused = (data ?? []) as Array<{ flag?: unknown }>;
    if (paused.length > 0) {
      await emit({
        severity: 'P3',
        ruleId: 'system_paused',
        title: 'One or more surfaces are paused',
        detail: { flags: paused.map((p) => String(p.flag)) },
        entityType: 'pause_flags',
      });
    }
  } catch (e) {
    record('system_paused', e);
  }

  // ── Housekeeping: keep the unauthenticated SIWE nonce table bounded ─────────
  // Opportunistic on the 5-min cron; fail-soft (reapExpiredNonces never throws).
  try {
    summary.noncesReaped = await reapExpiredNonces(sb);
  } catch (e) {
    record('nonce_reaper', e);
  }

  return summary;
}

/** Read max_platform_hourly_usdt from the risk_limits singleton (fallback default). */
async function loadHourlyCap(sb: Sb): Promise<number> {
  const { data, error } = await sb
    .from('risk_limits')
    .select('max_platform_hourly_usdt')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  const raw = (data as { max_platform_hourly_usdt?: unknown } | null)?.max_platform_hourly_usdt;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PLATFORM_HOURLY_USDT;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
