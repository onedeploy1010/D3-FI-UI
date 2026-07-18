import { describe, it, expect, vi } from 'vitest';

/**
 * UD3 v2 reward settlement (exact-Decimal calculator) — fund-safety regression.
 *
 * Real calculator + real config; only the DB (sb) and the perf rollup are mocked.
 * Scenario: 1000-USDT deposit, S1 引路人, upline chain S1→S6 above the referrer.
 *   总贿赂 1500 = guide 600 + network 600 (80/96/88/100/112/124) + burn 300.
 *
 * Asserts:
 *  - GUIDE_REWARD / NETWORK_DIFFERENCE_REWARD / BURN ledger rows with exact decimals.
 *  - credit_pending_ud3 called once per winner with the fixed-6 decimal STRING amount
 *    (never a JS Number) — atomic RPC, no read-modify-write of the balance column.
 *  - idempotency: a 23505 on a ledger row insert skips that winner's credit.
 */

vi.mock('./partnerPerformance.ts', () => ({
  // Per-wallet team performance → resolves each upline to S1..S6.
  sumReferralTreePerformance: async (_sb: unknown, wallet: string) =>
    PERF[String(wallet).toLowerCase()] ?? 0,
}));

import { allocateUd3ForCreditedIntent } from './partnerUd3Settle.ts';

// referrer S1 guide (perf ≤ 100k), uplines S1..S6 by total performance band.
const REFERRER = '0xREFERRER';
const UP = ['0xUP1', '0xUP2', '0xUP3', '0xUP4', '0xUP5', '0xUP6'];
const PERF: Record<string, number> = {
  [REFERRER.toLowerCase()]: 1_000, // S1 guide
  [UP[0].toLowerCase()]: 1_000, // S1  cumulative 0.20
  [UP[1].toLowerCase()]: 150_000, // S2  cumulative 0.44
  [UP[2].toLowerCase()]: 250_000, // S3  cumulative 0.66
  [UP[3].toLowerCase()]: 400_000, // S4  cumulative 0.91
  [UP[4].toLowerCase()]: 600_000, // S5  cumulative 1.19
  [UP[5].toLowerCase()]: 900_000, // S6  cumulative 1.50
};
// wallet_address (lower) → sponsor above it. referrer→up1→...→up6→(none).
const SPONSOR: Record<string, string> = {
  [REFERRER.toLowerCase()]: UP[0],
  [UP[0].toLowerCase()]: UP[1],
  [UP[1].toLowerCase()]: UP[2],
  [UP[2].toLowerCase()]: UP[3],
  [UP[3].toLowerCase()]: UP[4],
  [UP[4].toLowerCase()]: UP[5],
};

type Insert = { table: string; payload: Record<string, unknown> };

function makeSb(opts?: {
  rpc?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
  /** idempotency_key values whose ledger insert should return 23505. */
  duplicateKeys?: Set<string>;
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const inserts: Insert[] = [];
  const updates: Insert[] = [];
  const upserts: Insert[] = [];
  const rpcQueue: Record<string, Array<{ data?: unknown; error?: unknown }>> = { ...(opts?.rpc ?? {}) };
  const dup = opts?.duplicateKeys ?? new Set<string>();

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const q = rpcQueue[name];
      return Promise.resolve(q && q.length ? q.shift()! : { data: null, error: null });
    },
    from: (table: string) => {
      const st: { op: string; ilikeVal?: string; payload?: Record<string, unknown> } = { op: 'select' };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        insert: (p: Record<string, unknown>) => { st.op = 'insert'; st.payload = p; inserts.push({ table, payload: p }); return b; },
        update: (p: Record<string, unknown>) => { st.op = 'update'; updates.push({ table, payload: p }); return b; },
        upsert: (p: Record<string, unknown>) => { st.op = 'upsert'; upserts.push({ table, payload: p }); return b; },
        eq: () => b,
        ilike: (_col: string, val: string) => { st.ilikeVal = val; return b; },
        in: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (table === 'partner_ud3_events' && st.op === 'select') return { data: null, error: null };
        if (table === 'partner_ud3_events' && st.op === 'insert') return { data: { id: 'ev1' }, error: null };
        if (table === 'referrals') {
          const sponsor = SPONSOR[String(st.ilikeVal ?? '').toLowerCase()];
          return { data: sponsor ? { sponsor_wallet_address: sponsor } : null, error: null };
        }
        if (table === 'partner_ud3_ledger' && st.op === 'insert') {
          const key = String((st.payload as Record<string, unknown>)?.idempotency_key ?? '');
          if (dup.has(key)) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
  };
  return { sb, rpcCalls, inserts, updates, upserts };
}

const INPUT = {
  intentId: 'intent-1',
  depositorWallet: '0xDEPOSITOR',
  referrerWallet: REFERRER,
  depositUsdt: 1000,
  referrerTotalPerfUsdt: 1_000,
};

function ledgerRows(inserts: Insert[]) {
  return inserts.filter((i) => i.table === 'partner_ud3_ledger').map((i) => i.payload);
}

describe('allocateUd3ForCreditedIntent — v2 exact-Decimal reward settlement', () => {
  it('writes GUIDE_REWARD / NETWORK_DIFFERENCE_REWARD / BURN rows with exact decimals', async () => {
    const { sb, inserts } = makeSb();
    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const rows = ledgerRows(inserts);

    const guide = rows.find((r) => r.reward_type === 'GUIDE_REWARD')!;
    expect(guide).toBeTruthy();
    expect(guide.ud3_amount).toBe('600.000000');
    expect(guide.role).toBe('direct');
    expect(guide.beneficiary_level).toBe('S1');
    expect(guide.guide_level_rate).toBe('1.000000');
    expect(guide.total_bribe_amount).toBe('1500.000000');
    expect(guide.network_base_pool).toBe('400.000000');
    expect(guide.reward_status).toBe('CREDITED');
    expect(guide.level_config_version).toBe('ud3-v2-2026-07');

    const network = rows.filter((r) => r.reward_type === 'NETWORK_DIFFERENCE_REWARD');
    expect(network).toHaveLength(6);
    // Sorted closest-first: S1..S6 → 级差 80/96/88/100/112/124.
    const byDepth = [...network].sort((a, b) => Number(a.relation_depth) - Number(b.relation_depth));
    expect(byDepth.map((r) => r.ud3_amount)).toEqual([
      '80.000000', '96.000000', '88.000000', '100.000000', '112.000000', '124.000000',
    ]);
    expect(byDepth.map((r) => r.recipient_wallet)).toEqual(UP);
    expect(byDepth.map((r) => r.beneficiary_level)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(byDepth.every((r) => r.reward_status === 'CREDITED')).toBe(true);
    expect(byDepth[0].difference_rate).toBe('0.200000');
    expect(byDepth[1].difference_rate).toBe('0.240000');
    expect(byDepth[1].cumulative_rate).toBe('0.440000');
    expect(byDepth[1].previous_released_rate).toBe('0.200000');

    const burn = rows.find((r) => r.reward_type === 'BURN')!;
    expect(burn).toBeTruthy();
    expect(burn.ud3_amount).toBe('300.000000');
    expect(burn.recipient_wallet).toBe('burn:ud3');
    expect(burn.role).toBe('reserve');
    expect(burn.reward_status).toBe('CALCULATED');

    // Conservation: guide + network + burn == total bribe.
    const netTotal = network.reduce((s, r) => s + Number(r.ud3_amount), 0);
    expect(Number(guide.ud3_amount) + netTotal + Number(burn.ud3_amount)).toBe(1500);
  });

  it('credits each winner exactly once via the atomic RPC with decimal-STRING amounts', async () => {
    const { sb, rpcCalls, updates } = makeSb();
    await allocateUd3ForCreditedIntent(sb, INPUT);

    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    // 1 guide + 6 network winners.
    expect(credits).toHaveLength(7);

    const byWallet = new Map(credits.map((c) => [String(c.args.p_wallet).toLowerCase(), c.args.p_amount]));
    expect(byWallet.get(REFERRER.toLowerCase())).toBe('600.000000');
    expect(byWallet.get(UP[0].toLowerCase())).toBe('80.000000');
    expect(byWallet.get(UP[1].toLowerCase())).toBe('96.000000');
    expect(byWallet.get(UP[2].toLowerCase())).toBe('88.000000');
    expect(byWallet.get(UP[3].toLowerCase())).toBe('100.000000');
    expect(byWallet.get(UP[4].toLowerCase())).toBe('112.000000');
    expect(byWallet.get(UP[5].toLowerCase())).toBe('124.000000');

    // Every amount is a STRING (never a JS Number → no float drift).
    for (const c of credits) expect(typeof c.args.p_amount).toBe('string');

    // No read-modify-write of the balance/pending columns anywhere.
    for (const u of updates) {
      expect(Object.keys(u.payload)).not.toContain('ud3_balance');
      expect(Object.keys(u.payload)).not.toContain('pending_ud3');
    }

    // Immediate settlement runs once per winner.
    expect(rpcCalls.filter((c) => c.name === 'settle_pending_ud3')).toHaveLength(7);
  });

  it('idempotency: a 23505 on a ledger row skips that winner (no double credit)', async () => {
    // Duplicate the S3 upline's NETWORK_DIFFERENCE_REWARD row (replay of a prior run).
    const dupKey = `UD3_REWARD:${INPUT.intentId}:${UP[2]}:NETWORK_DIFFERENCE_REWARD:ud3-v2-2026-07`;
    const { sb, rpcCalls } = makeSb({ duplicateKeys: new Set([dupKey]) });

    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    // 7 winners minus the duplicated S3 row = 6 credits.
    expect(credits).toHaveLength(6);
    const wallets = credits.map((c) => String(c.args.p_wallet).toLowerCase());
    expect(wallets).not.toContain(UP[2].toLowerCase());
    // Other winners still credited.
    expect(wallets).toContain(REFERRER.toLowerCase());
    expect(wallets).toContain(UP[5].toLowerCase());
  });
});
