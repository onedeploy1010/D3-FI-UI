import { describe, it, expect, vi } from 'vitest';

// solvency.ts imports turnkey (esm.sh) at module load. We inject computeSolvency
// via deps in every test, so break the import chain here.
vi.mock('./solvency.ts', () => ({ computeSolvency: async () => ({ ratio: 999, minRatio: 1, liabilityUsdt: 0, flashSwapReserveUsdt: 0, healthy: true }) }));
// notifier.ts is injected too; stub it so the real one is never loaded/called.
vi.mock('./notifier.ts', () => ({ notify: async () => ({ sent: false, channels: [] }) }));

import { runSecurityScan, type MonitorDeps } from './securityMonitor.ts';

type Canned = {
  openAlertRuleIds?: string[]; // rule_ids that already have an open alert (dedup)
  withdrawalRows?: Array<{ net_amount_usdt: number }>;
  hourlyCap?: number;
  d3Price?: {
    price_usdt?: number;
    previous_price_usdt?: number;
    max_deviation_pct?: number;
    expires_at?: string | null;
  } | null;
  depositRows?: Array<{ tx_hash: string | null; created_at: string }>;
  pendingApprovals?: number;
  pausedFlags?: string[];
};

type Capture = {
  inserts: Array<Record<string, unknown>>;
  pauseUpdates: Array<{ patch: Record<string, unknown>; flag: unknown }>;
};

/** Fake Supabase client covering exactly the queries securityMonitor issues. */
function makeSb(canned: Canned, cap: Capture) {
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = [];
    let insertRow: Record<string, unknown> | null = null;
    let updatePatch: Record<string, unknown> | null = null;

    function resolveList(): { data: unknown; error: null } {
      if (table === 'partner_yield_withdrawals') return { data: canned.withdrawalRows ?? [], error: null };
      if (table === 'deposit_records') return { data: canned.depositRows ?? [], error: null };
      if (table === 'admin_action_approvals') {
        return { data: Array.from({ length: canned.pendingApprovals ?? 0 }, (_, i) => ({ id: `a${i}` })), error: null };
      }
      if (table === 'system_pause_flags') {
        return { data: (canned.pausedFlags ?? []).map((flag) => ({ flag, paused: true })), error: null };
      }
      return { data: [], error: null };
    }

    function resolveSingle(): { data: unknown; error: null } {
      // raiseAlert dedup lookup on security_alerts
      if (table === 'security_alerts' && !insertRow) {
        const ruleId = eqs.find(([c]) => c === 'rule_id')?.[1] as string | undefined;
        const isOpen = (canned.openAlertRuleIds ?? []).includes(ruleId ?? '');
        return { data: isOpen ? { id: 'existing', rule_id: ruleId, status: 'open' } : null, error: null };
      }
      if (table === 'security_alerts' && insertRow) {
        cap.inserts.push(insertRow);
        return { data: { id: 'new', ...insertRow }, error: null };
      }
      if (table === 'risk_limits') {
        return { data: { max_platform_hourly_usdt: canned.hourlyCap ?? 50000 }, error: null };
      }
      if (table === 'd3_price_settings') {
        return { data: canned.d3Price === undefined ? {} : canned.d3Price, error: null };
      }
      return { data: null, error: null };
    }

    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      insert: (row: Record<string, unknown>) => { insertRow = row; return b; },
      update: (patch: Record<string, unknown>) => { updatePatch = patch; return b; },
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        // system_pause_flags.update(...).eq('flag', ...) is awaited directly.
        if (table === 'system_pause_flags' && updatePatch) {
          cap.pauseUpdates.push({ patch: updatePatch, flag: val });
          return Promise.resolve({ data: null, error: null });
        }
        return b;
      },
      gte: () => b,
      limit: () => b,
      order: () => b,
      single: () => Promise.resolve(resolveSingle()),
      maybeSingle: () => Promise.resolve(resolveSingle()),
      then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
        Promise.resolve(resolveList()).then(f, r),
    };
    return b;
  }
  // deno-lint-ignore no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

const healthy = { ratio: 5, minRatio: 1, liabilityUsdt: 100, flashSwapReserveUsdt: 500, healthy: true };
const breached = { ratio: 0.5, minRatio: 1, liabilityUsdt: 1000, flashSwapReserveUsdt: 500, healthy: false };
const noLiability = { ratio: -1, minRatio: 1, liabilityUsdt: 0, flashSwapReserveUsdt: 500, healthy: true };

function deps(over: Partial<MonitorDeps> = {}): MonitorDeps & { notified: string[] } {
  const notified: string[] = [];
  const d = {
    computeSolvency: async () => healthy,
    notify: async (a: { ruleId: string }) => { notified.push(a.ruleId); },
    ...over,
    notified,
  } as MonitorDeps & { notified: string[] };
  return d;
}

describe('runSecurityScan', () => {
  it('P0 solvency breach → alert raised + flash_swap auto-paused + notify called', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({}, cap);
    const d = deps({ computeSolvency: async () => breached });
    const res = await runSecurityScan(sb, d);

    expect(res.raised).toContain('solvency_breach');
    expect(res.autoPaused).toContain('flash_swap');
    // pause write asserted
    expect(cap.pauseUpdates).toHaveLength(1);
    expect(cap.pauseUpdates[0].flag).toBe('flash_swap');
    expect(cap.pauseUpdates[0].patch.paused).toBe(true);
    expect(cap.pauseUpdates[0].patch.reason).toBe('auto: solvency breach');
    // alert row carries auto_paused true
    const p0 = cap.inserts.find((r) => r.rule_id === 'solvency_breach');
    expect(p0?.severity).toBe('P0');
    expect(p0?.auto_paused).toBe(true);
    // notify called for the P0
    expect(d.notified).toContain('solvency_breach');
    expect(res.notified).toContain('solvency_breach');
  });

  it('healthy solvency → no solvency alert, no pause', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({}, cap);
    const res = await runSecurityScan(sb, deps({ computeSolvency: async () => healthy }));
    expect(res.raised).not.toContain('solvency_breach');
    expect(cap.pauseUpdates).toHaveLength(0);
  });

  it('no-liability sentinel (ratio -1) → skipped', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({}, cap);
    const res = await runSecurityScan(sb, deps({ computeSolvency: async () => noLiability }));
    expect(res.raised).not.toContain('solvency_breach');
    expect(cap.pauseUpdates).toHaveLength(0);
  });

  it('P1 hourly withdrawal volume over cap → alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ hourlyCap: 1000, withdrawalRows: [{ net_amount_usdt: 800 }, { net_amount_usdt: 500 }] }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('platform_hourly_volume');
    const a = cap.inserts.find((r) => r.rule_id === 'platform_hourly_volume');
    expect(a?.severity).toBe('P1');
  });

  it('P1 hourly volume under cap → no alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ hourlyCap: 50000, withdrawalRows: [{ net_amount_usdt: 100 }] }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).not.toContain('platform_hourly_volume');
  });

  it('P1 D3 price stale (expires_at past) → alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = makeSb({ d3Price: { price_usdt: 5, expires_at: past } }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('d3_price_stale');
  });

  it('P1 D3 price deviation over max → alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const sb = makeSb({ d3Price: { price_usdt: 7, previous_price_usdt: 5, max_deviation_pct: 20, expires_at: future } }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('d3_price_swing'); // 40% > 20%
  });

  it('P1 D3 price within bounds → no swing alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const sb = makeSb({ d3Price: { price_usdt: 5.5, previous_price_usdt: 5, max_deviation_pct: 20, expires_at: future } }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).not.toContain('d3_price_swing');
    expect(res.raised).not.toContain('d3_price_stale');
  });

  it('P1 duplicate deposit tx_hash → alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const now = new Date().toISOString();
    const sb = makeSb({ depositRows: [
      { tx_hash: '0xDUP', created_at: now },
      { tx_hash: '0xdup', created_at: now }, // case-insensitive dup
      { tx_hash: '0xother', created_at: now },
    ] }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('deposit_duplicate_tx');
  });

  it('P2 pending admin approvals → alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ pendingApprovals: 2 }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('admin_pending_approvals');
    expect(cap.inserts.find((r) => r.rule_id === 'admin_pending_approvals')?.severity).toBe('P2');
  });

  it('P3 paused flags → reminder alert', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ pausedFlags: ['flash_swap', 'deposits'] }, cap);
    const res = await runSecurityScan(sb, deps());
    expect(res.raised).toContain('system_paused');
    expect(cap.inserts.find((r) => r.rule_id === 'system_paused')?.severity).toBe('P3');
  });

  it('dedup: existing open alert with same ruleId → no second insert, no re-notify', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ openAlertRuleIds: ['solvency_breach'] }, cap);
    const d = deps({ computeSolvency: async () => breached });
    const res = await runSecurityScan(sb, d);
    // still auto-pauses (idempotent), but does NOT insert a new alert or re-notify
    expect(cap.inserts.find((r) => r.rule_id === 'solvency_breach')).toBeUndefined();
    expect(res.raised).not.toContain('solvency_breach');
    expect(d.notified).not.toContain('solvency_breach');
  });

  it('per-rule fail-soft: a throwing rule is recorded but does not abort the scan', async () => {
    const cap: Capture = { inserts: [], pauseUpdates: [] };
    const sb = makeSb({ pendingApprovals: 1 }, cap);
    const d = deps({ computeSolvency: async () => { throw new Error('rpc down'); } });
    const res = await runSecurityScan(sb, d);
    expect(res.errors.some((e) => e.rule === 'solvency_breach')).toBe(true);
    // later rules still ran
    expect(res.raised).toContain('admin_pending_approvals');
  });
});
