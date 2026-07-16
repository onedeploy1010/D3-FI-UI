import { describe, it, expect, vi } from 'vitest';

/**
 * NEW-1 regression: UD3 reward credits must persist the spendable `ud3_balance` via the
 * atomic `credit_ud3_balance` RPC — NOT a read-modify-write — so a concurrent atomic
 * `debit_ud3_balance` (re-stake / transfer) can't be clobbered (lost-update double-spend).
 */

// Deterministic settlement: one direct payout to the referrer, no network differential.
vi.mock('./partnerUd3Rules.ts', () => ({
  getUd3Tier: () => ({ id: 't1', ratePct: 1 }),
  resolveUd3SLevel: () => ({ id: 1, label: 'S1', sharePct: 100 }),
  resolveUd3VLevel: () => ({ id: 1, label: 'S1', sharePct: 100 }),
  settleUd3DepositEvent: () => ({
    tier: { id: 't1' },
    tierRatePct: 1,
    generatedUd3: 60,
    directUd3: 60,
    networkPoolUd3: 0,
    referrerNetworkSharePct: 0,
    network: { payouts: [], allocatedUd3: 0, remainingUd3: 0, remainingPct: 0 },
  }),
}));
vi.mock('./partnerPerformance.ts', () => ({
  sumReferralTreePerformance: async () => 0,
}));

import { allocateUd3ForCreditedIntent } from './partnerUd3Settle.ts';

type UpdateCall = { table: string; payload: Record<string, unknown> };
type UpsertCall = { table: string; payload: Record<string, unknown> };

function makeSb(opts: {
  rpc?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
  accountRow?: unknown;
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const updates: UpdateCall[] = [];
  const upserts: UpsertCall[] = [];
  const rpcQueue: Record<string, Array<{ data?: unknown; error?: unknown }>> = { ...(opts.rpc ?? {}) };

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const q = rpcQueue[name];
      return Promise.resolve(q && q.length ? q.shift()! : { data: null, error: null });
    },
    from: (table: string) => {
      const st = { op: 'select' };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        insert: () => { st.op = 'insert'; return b; },
        update: (p: Record<string, unknown>) => { st.op = 'update'; updates.push({ table, payload: p }); return b; },
        upsert: (p: Record<string, unknown>) => { st.op = 'upsert'; upserts.push({ table, payload: p }); return b; },
        eq: () => b,
        ilike: () => b,
        in: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (table === 'partner_ud3_events' && st.op === 'select') return { data: null, error: null };
        if (table === 'partner_ud3_events' && st.op === 'insert') return { data: { id: 'ev1' }, error: null };
        if (table === 'referrals') return { data: null, error: null }; // no upline -> chain empty
        if (table === 'partner_accounts' && st.op === 'select') {
          return { data: opts.accountRow ?? null, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
  };
  return { sb, rpcCalls, updates, upserts };
}

const INPUT = {
  intentId: 'intent-1',
  depositorWallet: '0xDEPOSITOR',
  referrerWallet: '0xREFERRER',
  depositUsdt: 100,
  referrerTotalPerfUsdt: 0,
};

describe('allocateUd3ForCreditedIntent — NEW-1 atomic ud3_balance credit', () => {
  it('credits ud3_balance via the atomic RPC and never write-backs the balance column', async () => {
    const { sb, rpcCalls, updates } = makeSb({
      accountRow: { wallet_address: '0xREFERRER', lifetime_ud3_earned: 0 },
      rpc: { credit_ud3_balance: [{ data: 60, error: null }] },
    });

    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const credit = rpcCalls.find((c) => c.name === 'credit_ud3_balance');
    expect(credit).toBeTruthy();
    expect(credit!.args.p_amount).toBe(60);
    expect(String(credit!.args.p_wallet).toLowerCase()).toBe('0xreferrer');

    // No read-modify-write of the spendable balance column may remain anywhere.
    for (const u of updates) {
      expect(Object.keys(u.payload)).not.toContain('ud3_balance');
    }
  });

  it('ACCOUNT_NOT_FOUND -> provisions the account (no seeded balance) then retries the atomic credit', async () => {
    const { sb, rpcCalls, upserts } = makeSb({
      accountRow: { wallet_address: '0xREFERRER', lifetime_ud3_earned: 0 },
      rpc: {
        credit_ud3_balance: [
          { data: null, error: { message: 'ACCOUNT_NOT_FOUND' } },
          { data: 60, error: null },
        ],
      },
    });

    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const credits = rpcCalls.filter((c) => c.name === 'credit_ud3_balance');
    expect(credits).toHaveLength(2);

    // Provisioning upsert must NOT seed ud3_balance (the atomic credit owns it).
    const provision = upserts.find((u) => u.table === 'partner_accounts');
    expect(provision).toBeTruthy();
    expect(Object.keys(provision!.payload)).not.toContain('ud3_balance');
  });
});
