import { describe, it, expect, vi } from 'vitest';

// Heavy chain deps (turnkey pulls an esm.sh import) — mock so the module loads
// under Node and so we control the flash-swap wallet / price.
vi.mock('./turnkey.ts', () => ({
  parseUsdtAmount: (n: number) => BigInt(Math.round(n * 1e6)),
  formatUsdtAmount: (wei: bigint) => (Number(wei) / 1e6).toString(),
}));
vi.mock('./wallets.ts', () => ({
  ensureInfrastructureWallets: async () => {},
  getFlashSwapWallet: async () => ({ id: 'flash1', address: '0xflash' }),
}));
vi.mock('./d3Price.ts', () => ({
  getD3PriceUsdt: async () => 5,
  d3ToUsdt: (d3: number, price: number) => d3 * price,
  usdtToD3: (usdt: number, price: number) => usdt / price,
}));
vi.mock('./audit.ts', () => ({ writeAuditLog: async () => {} }));
// Risk controls (V-09/V-10) are covered by riskControls.security.test.ts; stub
// here so these V-03 atomic-debit cases stay isolated and never hit the real
// solvency/chain path.
vi.mock('./riskControls.ts', () => ({ assertWithdrawAllowed: async () => {} }));

import { requestPartnerYieldWithdraw } from './partnerYieldWithdraw.ts';
import { HttpError } from './wallet.ts';

type Resp = {
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
  account?: unknown;
  inflight?: unknown;
  withdrawalInsert?: { data?: unknown; error?: unknown };
  jobInsert?: { data?: unknown; error?: unknown };
};

function makeSb(responses: Resp) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  function resolveQuery(table: string, st: { op: string }) {
    if (table === 'partner_accounts' && st.op === 'select') {
      return { data: responses.account ?? null, error: null };
    }
    if (table === 'partner_yield_withdrawals' && st.op === 'select') {
      return { data: responses.inflight ?? null, error: null };
    }
    if (table === 'partner_yield_withdrawals' && st.op === 'insert') {
      return responses.withdrawalInsert ?? { data: { id: 'w1' }, error: null };
    }
    if (table === 'sweep_jobs' && st.op === 'insert') {
      return responses.jobInsert ?? { data: { id: 'j1' }, error: null };
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
        delete: () => { st.op = 'delete'; return b; },
        eq: () => b,
        in: () => b,
        maybeSingle: () => Promise.resolve(resolveQuery(table, st)),
        single: () => Promise.resolve(resolveQuery(table, st)),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolveQuery(table, st)).then(f, r),
      };
      return b;
    },
  };
  return { sb, rpcCalls };
}

const PARTNER = { is_partner: true, pending_d3_yield: 100 };

describe('requestPartnerYieldWithdraw — V-03 atomic debit', () => {
  it('debit rejects INSUFFICIENT_BALANCE -> HttpError 400', async () => {
    const { sb, rpcCalls } = makeSb({
      account: PARTNER,
      rpc: { debit_pending_d3_yield: { error: { message: 'INSUFFICIENT_BALANCE' } } },
    });
    await expect(requestPartnerYieldWithdraw(sb, '0xabc', 1)).rejects.toMatchObject({
      status: 400,
    });
    // Debit was attempted, and no compensation credit should fire (nothing debited).
    expect(rpcCalls.map((c) => c.name)).toEqual(['debit_pending_d3_yield']);
  });

  it('debit ok but withdrawal insert throws -> compensates with credit_pending_d3_yield', async () => {
    const { sb, rpcCalls } = makeSb({
      account: PARTNER,
      rpc: {
        debit_pending_d3_yield: { data: 99, error: null },
        credit_pending_d3_yield: { data: 100, error: null },
      },
      withdrawalInsert: { error: { message: 'insert boom' } },
    });
    await expect(requestPartnerYieldWithdraw(sb, '0xabc', 1)).rejects.toThrow();
    const names = rpcCalls.map((c) => c.name);
    expect(names).toContain('debit_pending_d3_yield');
    expect(names).toContain('credit_pending_d3_yield');
  });

  it('23505 in-flight collision on insert -> 409 and compensates', async () => {
    const { sb, rpcCalls } = makeSb({
      account: PARTNER,
      rpc: {
        debit_pending_d3_yield: { data: 99, error: null },
        credit_pending_d3_yield: { data: 100, error: null },
      },
      withdrawalInsert: { error: { code: '23505', message: 'duplicate key' } },
    });
    await expect(requestPartnerYieldWithdraw(sb, '0xabc', 1)).rejects.toMatchObject({
      status: 409,
    });
    expect(rpcCalls.map((c) => c.name)).toContain('credit_pending_d3_yield');
  });

  it('happy path debits then queues withdrawal + sweep job', async () => {
    const { sb, rpcCalls } = makeSb({
      account: PARTNER,
      rpc: { debit_pending_d3_yield: { data: 99, error: null } },
      withdrawalInsert: { data: { id: 'w9' }, error: null },
      jobInsert: { data: { id: 'j9' }, error: null },
    });
    const res = await requestPartnerYieldWithdraw(sb, '0xabc', 1);
    expect(res.withdrawalId).toBe('w9');
    expect(res.status).toBe('pending');
    // Debited exactly once, no compensation.
    expect(rpcCalls.map((c) => c.name)).toEqual(['debit_pending_d3_yield']);
  });

  it('advisory pre-check rejects amount over pending before touching RPC', async () => {
    const { sb, rpcCalls } = makeSb({ account: { is_partner: true, pending_d3_yield: 0.0001 } });
    await expect(requestPartnerYieldWithdraw(sb, '0xabc', 5)).rejects.toBeInstanceOf(HttpError);
    expect(rpcCalls).toHaveLength(0);
  });
});
