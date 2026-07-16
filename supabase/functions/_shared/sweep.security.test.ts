import { describe, it, expect, vi } from 'vitest';

// sweep.ts imports viem-backed helpers (turnkey/wallets) via npm: specifiers only
// inside functions, but its module-top imports of ./turnkey.ts etc. pull heavy deps.
// We only exercise the pure DB-driven failure handler, so stub those modules.
vi.mock('./turnkey.ts', () => ({
  formatUsdtAmount: () => '0',
  getErc20Balance: async () => 0n,
  parseUsdtAmount: () => 0n,
  sendErc20Transfer: async () => '0x',
  settlementFlashSwapSplitBps: () => 0,
  settlementToTreasuryMinUsdt: () => 0,
  walletContextFromDbRow: () => ({}),
  getBscPublicClient: () => ({}),
}));
vi.mock('./wallets.ts', () => ({
  ensureInfrastructureWallets: async () => {},
  getFlashSwapWallet: async () => null,
  getGasWallet: async () => null,
  getTreasuryWallet: async () => null,
  getWalletById: async () => null,
  pickSettlementWallet: async () => ({ id: 'w', address: '0x' }),
}));
vi.mock('./ledger.ts', () => ({ postLedgerEntry: async () => {} }));
vi.mock('./audit.ts', () => ({ writeAuditLog: async () => {} }));

import { handleYieldWithdrawSweepFailure } from './sweep.ts';

type Job = {
  id: string;
  job_type: string;
  reference_id: string | null;
  tx_hash?: string | null;
};

function makeSb(opts: {
  freshTxHash?: string | null; // sweep_jobs.tx_hash as read back from DB
  withdrawal?: { wallet_address: string; d3_amount: number } | null;
  claimReturnsRow?: boolean; // whether the guarded status transition wins a row
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: Record<string, unknown> }[] = [];

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const st = { op: 'select', selectedWithSelect: false };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => { if (st.op === 'update') st.selectedWithSelect = true; return b; },
        update: (p: Record<string, unknown>) => { st.op = 'update'; updates.push({ table, payload: p }); return b; },
        eq: () => b,
        in: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (table === 'sweep_jobs' && st.op === 'select') {
          return { data: { tx_hash: opts.freshTxHash ?? null }, error: null };
        }
        if (table === 'partner_yield_withdrawals') {
          if (st.op === 'update' && st.selectedWithSelect) {
            // guarded status transition -> .select('id')
            return { data: opts.claimReturnsRow ? [{ id: 'wd1' }] : [], error: null };
          }
          if (st.op === 'select') {
            return { data: opts.withdrawal ?? null, error: null };
          }
        }
        return { data: null, error: null };
      }
      return b;
    },
  };
  return { sb, rpcCalls, updates };
}

const JOB: Job = { id: 'job1', job_type: 'yield_flash_withdraw', reference_id: 'wd1', tx_hash: null };

describe('handleYieldWithdrawSweepFailure — NEW-2 slow-tx refund double-payout', () => {
  it('terminal failure WITH a broadcast tx_hash -> escalate manual_review, NO refund', async () => {
    const { sb, rpcCalls, updates } = makeSb({
      freshTxHash: '0xabc123', // a tx WAS broadcast (may still mine)
      withdrawal: { wallet_address: '0xW', d3_amount: 50 },
      claimReturnsRow: true,
    });

    const outcome = await handleYieldWithdrawSweepFailure(sb, JOB as any, 'manual_review', 'timeout');
    expect(outcome).toBe('escalated_broadcast');

    // No D3 refund may be issued while the USDT tx could still land.
    expect(rpcCalls.find((c) => c.name === 'credit_pending_d3_yield')).toBeUndefined();

    // The withdrawal is flagged manual_review so nothing silently refunds it later.
    const wdUpdate = updates.find((u) => u.table === 'partner_yield_withdrawals');
    expect(wdUpdate?.payload.status).toBe('manual_review');
  });

  it('terminal failure WITHOUT a broadcast tx_hash -> refund exactly once', async () => {
    const { sb, rpcCalls, updates } = makeSb({
      freshTxHash: null, // no tx broadcast
      withdrawal: { wallet_address: '0xW', d3_amount: 50 },
      claimReturnsRow: true,
    });

    const outcome = await handleYieldWithdrawSweepFailure(sb, JOB as any, 'manual_review', 'no gas');
    expect(outcome).toBe('refunded');

    const refunds = rpcCalls.filter((c) => c.name === 'credit_pending_d3_yield');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].args.p_amount).toBe(50);
    expect(String(refunds[0].args.p_wallet)).toBe('0xW');

    const wdUpdate = updates.find((u) => u.table === 'partner_yield_withdrawals');
    expect(wdUpdate?.payload.status).toBe('failed');
  });

  it('terminal failure without broadcast but guard loses the transition -> NO refund (idempotent)', async () => {
    const { sb, rpcCalls } = makeSb({
      freshTxHash: null,
      withdrawal: { wallet_address: '0xW', d3_amount: 50 },
      claimReturnsRow: false, // another caller already flipped it
    });

    await handleYieldWithdrawSweepFailure(sb, JOB as any, 'manual_review', 'no gas');
    expect(rpcCalls.filter((c) => c.name === 'credit_pending_d3_yield')).toHaveLength(0);
  });

  it('transient failure (status queued) -> record error only, no refund', async () => {
    const { sb, rpcCalls } = makeSb({ freshTxHash: '0xabc', withdrawal: { wallet_address: '0xW', d3_amount: 50 }, claimReturnsRow: true });
    const outcome = await handleYieldWithdrawSweepFailure(sb, JOB as any, 'queued', 'temporary');
    expect(outcome).toBe('transient');
    expect(rpcCalls.filter((c) => c.name === 'credit_pending_d3_yield')).toHaveLength(0);
  });
});
