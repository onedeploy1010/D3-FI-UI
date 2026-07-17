import { describe, it, expect, vi } from 'vitest';

vi.mock('./d3Price.ts', () => ({
  getD3PriceUsdt: async () => 5,
  usdtToD3: (usdt: number, price: number) => usdt / price,
}));
vi.mock('./audit.ts', () => ({ writeAuditLog: async () => {} }));

import { stakePartnerUd3 } from './partnerUd3Stake.ts';

type Resp = {
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
  account?: unknown;
  positionInsert?: { data?: unknown; error?: unknown };
};

function makeSb(responses: Resp) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const deletes: string[] = [];
  function resolve(table: string, st: { op: string }) {
    if (table === 'partner_accounts' && st.op === 'select') return { data: responses.account ?? null, error: null };
    if (table === 'partner_stake_positions' && st.op === 'insert') {
      return responses.positionInsert ?? { data: { id: 'p1', unlock_at: '2027-01-01T00:00:00Z' }, error: null };
    }
    return { data: null, error: null };
  }
  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(responses.rpc?.[name] ?? { data: null, error: null });
    },
    from: (table: string) => {
      const st = { op: 'select' };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        insert: () => { st.op = 'insert'; return b; },
        update: () => { st.op = 'update'; return b; },
        delete: () => { st.op = 'delete'; deletes.push(table); return b; },
        eq: () => b,
        maybeSingle: () => Promise.resolve(resolve(table, st)),
        single: () => Promise.resolve(resolve(table, st)),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve(table, st)).then(f, r),
      };
      return b;
    },
  };
  return { sb, rpcCalls, deletes };
}

const ACCT = { wallet_address: '0xw', is_partner: true, ud3_balance: 1000 };

describe('stakePartnerUd3 — V-06 atomic debit', () => {
  it('debit rejects INSUFFICIENT_BALANCE -> 400 and rolls back the position', async () => {
    const { sb, rpcCalls, deletes } = makeSb({
      account: ACCT,
      positionInsert: { data: { id: 'p7', unlock_at: '2027-01-01T00:00:00Z' }, error: null },
      rpc: { debit_ud3_balance: { error: { message: 'INSUFFICIENT_BALANCE' } } },
    });
    await expect(stakePartnerUd3(sb, '0xw', 100)).rejects.toMatchObject({ status: 400 });
    expect(rpcCalls.map((c) => c.name)).toContain('debit_ud3_balance');
    // Placeholder position was deleted (no double-spend / no stranded stake).
    expect(deletes).toContain('partner_stake_positions');
  });

  it('success path inserts position then debits UD3', async () => {
    const { sb, rpcCalls, deletes } = makeSb({
      account: ACCT,
      positionInsert: { data: { id: 'p9', unlock_at: '2027-06-01T00:00:00Z' }, error: null },
      rpc: { debit_ud3_balance: { data: 900, error: null } },
    });
    const res = await stakePartnerUd3(sb, '0xw', 100);
    expect(res.positionId).toBe('p9');
    expect(res.ud3Balance).toBe(900);
    expect(rpcCalls.map((c) => c.name)).toContain('debit_ud3_balance');
    expect(deletes).toHaveLength(0);
  });

  it('advisory pre-check rejects amount over balance before touching RPC', async () => {
    const { sb, rpcCalls } = makeSb({ account: { wallet_address: '0xw', is_partner: true, ud3_balance: 50 } });
    await expect(stakePartnerUd3(sb, '0xw', 100)).rejects.toMatchObject({ status: 400 });
    expect(rpcCalls).toHaveLength(0);
  });
});
