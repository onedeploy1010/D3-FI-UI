import { describe, it, expect } from 'vitest';
import {
  assertSettlementDateNotFuture,
  creditSettlementYield,
  settleUd3Ledger,
} from './partnerSettlement.ts';

/**
 * V-11 regression: a caller-supplied settlement date must be valid YYYY-MM-DD and
 * must NOT be in the future relative to today in SGT. Settling a future day would
 * credit yield that has not yet accrued. `todaySgt` is injected so the test is
 * deterministic and independent of the real clock.
 */

const TODAY = '2026-07-16';

describe('assertSettlementDateNotFuture', () => {
  it('today -> ok', () => {
    expect(() => assertSettlementDateNotFuture(TODAY, TODAY)).not.toThrow();
  });

  it('past date -> ok', () => {
    expect(() => assertSettlementDateNotFuture('2026-07-15', TODAY)).not.toThrow();
    expect(() => assertSettlementDateNotFuture('2025-01-01', TODAY)).not.toThrow();
  });

  it('future date -> throws HttpError(400) "in the future"', () => {
    try {
      assertSettlementDateNotFuture('2026-07-17', TODAY);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(String(e.message)).toContain('future');
    }
  });

  it('malformed date -> throws HttpError(400)', () => {
    for (const bad of ['2026-7-16', '20260716', 'not-a-date', '', '2026/07/16']) {
      try {
        assertSettlementDateNotFuture(bad, TODAY);
        throw new Error(`expected throw for ${bad}`);
      } catch (e: any) {
        expect(e.status).toBe(400);
      }
    }
  });

  it('impossible calendar date passing the regex -> throws HttpError(400)', () => {
    try {
      assertSettlementDateNotFuture('2026-13-40', TODAY);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});

/**
 * NEW-1 regression: the daily D3 release must credit the spendable `pending_d3_yield`
 * via the atomic `credit_pending_d3_yield` RPC — NOT a read-modify-write — so a
 * concurrent atomic withdraw debit can't be clobbered (lost-update double-spend).
 */
type UpdateCall = { table: string; payload: Record<string, unknown> };

function makeSb(opts: {
  rpc?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
  acct?: unknown;
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const updates: UpdateCall[] = [];
  const upserts: { table: string; payload: unknown }[] = [];
  const rpcQueue: Record<string, Array<{ data?: unknown; error?: unknown }>> = {
    ...(opts.rpc ?? {}),
  };

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const q = rpcQueue[name];
      const resp = q && q.length ? q.shift()! : { data: null, error: null };
      return Promise.resolve(resp);
    },
    from: (table: string) => {
      const st = { op: 'select', payload: undefined as unknown };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        insert: (p: unknown) => { st.op = 'insert'; st.payload = p; return b; },
        update: (p: Record<string, unknown>) => {
          st.op = 'update';
          updates.push({ table, payload: p });
          return b;
        },
        upsert: (p: unknown) => { st.op = 'upsert'; upserts.push({ table, payload: p }); return b; },
        eq: () => b,
        ilike: () => b,
        in: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (table === 'partner_accounts' && st.op === 'select') {
          return { data: opts.acct ?? null, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
  };
  return { sb, rpcCalls, updates, upserts };
}

describe('creditSettlementYield — NEW-1 atomic pending_d3_yield credit', () => {
  it('credits pending_d3_yield via atomic RPC and never write-backs the balance column', async () => {
    const { sb, rpcCalls, updates } = makeSb({
      acct: { lifetime_d3_yield: 1, pending_usdt_yield: 2, lifetime_usdt_yield: 3 },
      rpc: { credit_pending_d3_yield: [{ data: 12.5, error: null }] },
    });

    await creditSettlementYield(sb, '0xWALLET', 2.5, 12.5);

    const credit = rpcCalls.find((c) => c.name === 'credit_pending_d3_yield');
    expect(credit).toBeTruthy();
    expect(credit!.args.p_amount).toBe(2.5);
    expect(String(credit!.args.p_wallet)).toBe('0xWALLET');

    // No read-modify-write of the spendable balance column may remain.
    for (const u of updates) {
      expect(Object.keys(u.payload)).not.toContain('pending_d3_yield');
    }
  });

  it('ACCOUNT_NOT_FOUND -> provisions the row then retries the atomic credit once', async () => {
    const { sb, rpcCalls, upserts } = makeSb({
      acct: { lifetime_d3_yield: 0, pending_usdt_yield: 0, lifetime_usdt_yield: 0 },
      rpc: {
        credit_pending_d3_yield: [
          { data: null, error: { message: 'ACCOUNT_NOT_FOUND' } },
          { data: 2.5, error: null },
        ],
      },
    });

    await creditSettlementYield(sb, '0xNEW', 2.5, 12.5);

    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_d3_yield');
    expect(credits).toHaveLength(2);
    expect(upserts.some((u) => u.table === 'partner_accounts')).toBe(true);
  });
});

/**
 * R-7 regression: the UD3 two-phase settlement loop must mark a recipient's ledger rows
 * settled=true ONLY when its settle_pending_ud3 succeeded. A failed settle must leave the
 * rows settled=false (so the next daily run retries) — otherwise the reward is stuck in
 * pending_ud3 yet flagged settled, and the user is silently under-credited.
 */
type LedgerUpdate = { payload: Record<string, unknown>; ids: string[] };

function makeLedgerSb(rpcResultsByWallet: Record<string, { error?: unknown }>) {
  const rpcWallets: string[] = [];
  const ledgerUpdates: LedgerUpdate[] = [];

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      const w = String(args.p_wallet).toLowerCase();
      if (name === 'settle_pending_ud3') rpcWallets.push(w);
      const r = rpcResultsByWallet[w];
      return Promise.resolve({ data: null, error: r?.error ?? null });
    },
    from: (table: string) => {
      let pending: Record<string, unknown> | null = null;
      // deno-lint-ignore no-explicit-any
      const b: any = {
        update: (p: Record<string, unknown>) => {
          pending = p;
          return b;
        },
        // `.in('id', ids)` is the terminal awaited call for the settled-update.
        in: (_col: string, ids: string[]) => {
          if (table === 'partner_ud3_ledger' && pending) {
            ledgerUpdates.push({ payload: pending, ids });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { sb, rpcWallets, ledgerUpdates };
}

describe('settleUd3Ledger — R-7 settled-flag gated on settle success', () => {
  const ROWS = [
    { id: 'A1', recipient_wallet: '0xAAA' },
    { id: 'A2', recipient_wallet: '0xAAA' },
    { id: 'B1', recipient_wallet: '0xBBB' },
  ];

  it('does NOT mark rows settled for a wallet whose settle_pending_ud3 rejected, but DOES for a successful one', async () => {
    // 0xAAA succeeds, 0xBBB fails.
    const { sb, rpcWallets, ledgerUpdates } = makeLedgerSb({
      '0xbbb': { error: { message: 'boom' } },
    });

    const res = await settleUd3Ledger(sb, ROWS, '2026-07-16');

    // Both wallets were attempted.
    expect(rpcWallets.sort()).toEqual(['0xaaa', '0xbbb']);

    // Only the successful wallet's rows are settled; the failed wallet is reported.
    expect(res.settledRows).toBe(2);
    expect(res.failedWallets).toEqual(['0xbbb']);

    const settledIds = ledgerUpdates.flatMap((u) => u.ids);
    expect(settledIds).toContain('A1');
    expect(settledIds).toContain('A2');
    // The failed wallet's ledger row must NOT be flipped settled.
    expect(settledIds).not.toContain('B1');

    // Every issued update sets settled=true (never settled=false).
    for (const u of ledgerUpdates) expect(u.payload.settled).toBe(true);
  });

  it('all recipients fail -> issues NO settled-update at all (rows retried next run)', async () => {
    const { sb, ledgerUpdates } = makeLedgerSb({
      '0xaaa': { error: { message: 'x' } },
      '0xbbb': { error: { message: 'y' } },
    });

    const res = await settleUd3Ledger(sb, ROWS, '2026-07-16');

    expect(res.settledRows).toBe(0);
    expect(res.failedWallets.sort()).toEqual(['0xaaa', '0xbbb']);
    expect(ledgerUpdates).toHaveLength(0);
  });

  it('all recipients succeed -> every row flipped settled', async () => {
    const { sb, ledgerUpdates } = makeLedgerSb({});

    const res = await settleUd3Ledger(sb, ROWS, '2026-07-16');

    expect(res.settledRows).toBe(3);
    expect(res.failedWallets).toEqual([]);
    const settledIds = ledgerUpdates.flatMap((u) => u.ids);
    expect(settledIds.sort()).toEqual(['A1', 'A2', 'B1']);
  });
});
