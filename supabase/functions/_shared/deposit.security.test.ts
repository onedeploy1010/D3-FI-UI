import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real turnkey module pulls in `npm:viem` (on-chain verification + signing),
// which we neither want to load nor hit the network with in a unit test. Replace it
// with a controllable stub. `verifyUsdtTransfer` is driven per-test via `verifyResult`.
let verifyResult: { ok: boolean; amount: bigint; confirmations: number };
vi.mock('./turnkey.ts', () => ({
  verifyUsdtTransfer: vi.fn(async () => verifyResult),
  parseUsdtAmount: (n: number) => BigInt(Math.round(n * 1e6)),
  formatUsdtAmount: (wei: bigint) => (Number(wei) / 1e6).toFixed(2),
}));

// deposit.ts statically imports these, and their real bodies pull `npm:viem`
// (deposit pool key derivation). They are only used by createStakeIntent, which the
// idempotency path under test never touches, so stub them to keep the tree viem-free.
vi.mock('./depositPool.ts', () => ({
  claimDepositWalletFromPool: vi.fn(),
  createOnDemandDepositWallet: vi.fn(),
  replenishDepositPoolIfLow: vi.fn(),
}));
vi.mock('./wallets.ts', () => ({ ensureInfrastructureWallets: vi.fn() }));

import {
  reportDepositTx,
  postDepositCreditLedger,
  type ReportDepositDeps,
} from './deposit.ts';

const WALLET = '0xWallet';
const INTENT = 'intent-1';
const TX = '0xabc123';
const DEPOSIT_ADDR = '0xDepositAddr';

/**
 * Minimal chainable Supabase fake. Every query records its (table, op, filters,
 * payload) into `calls`, and resolves from `responses[table][op]` (a value or a
 * function of the recorded call). Both awaiting the builder directly and the
 * `.maybeSingle()` / `.single()` terminals are supported.
 */
type Call = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  filters: [string, string, unknown][];
  payload: unknown;
  selectArg?: string;
  terminal: 'list' | 'maybeSingle' | 'single';
};

function makeSb(responses: Record<string, Record<string, unknown>>) {
  const calls: Call[] = [];

  function resolve(state: Omit<Call, 'terminal'>, terminal: Call['terminal']) {
    const call: Call = { ...state, terminal };
    calls.push(call);
    const tableCfg = responses[state.table] ?? {};
    const raw = tableCfg[state.op];
    const value = typeof raw === 'function' ? (raw as (c: Call) => unknown)(call) : raw;
    const data = value ?? (terminal === 'list' ? [] : null);
    return Promise.resolve({ data, error: null });
  }

  function makeBuilder(table: string) {
    const state: Omit<Call, 'terminal'> = { table, op: 'select', filters: [], payload: null };
    const builder: Record<string, unknown> = {
      select(arg?: string) {
        if (state.op === 'select') state.selectArg = arg;
        else state.selectArg = arg; // e.g. update(...).select('id')
        return builder;
      },
      insert(payload: unknown) {
        state.op = 'insert';
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      upsert(payload: unknown) {
        state.op = 'upsert';
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push(['eq', col, val]);
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters.push(['neq', col, val]);
        return builder;
      },
      ilike(col: string, val: unknown) {
        state.filters.push(['ilike', col, val]);
        return builder;
      },
      in(col: string, val: unknown) {
        state.filters.push(['in', col, val]);
        return builder;
      },
      gte(col: string, val: unknown) {
        state.filters.push(['gte', col, val]);
        return builder;
      },
      lte(col: string, val: unknown) {
        state.filters.push(['lte', col, val]);
        return builder;
      },
      maybeSingle() {
        return resolve(state, 'maybeSingle');
      },
      single() {
        return resolve(state, 'single');
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return resolve(state, 'list').then(onF, onR);
      },
    };
    return builder;
  }

  const sb = {
    from: (table: string) => makeBuilder(table),
  } as unknown as Parameters<typeof reportDepositTx>[0];

  return { sb, calls };
}

function makeDeps(overrides: Partial<ReportDepositDeps> = {}): ReportDepositDeps {
  return {
    rollupPartnerPerformance: vi.fn(async () => {}),
    postDepositCreditLedger: vi.fn(async () => {}),
    syncStakePositionOnCredit: vi.fn(async () => {}),
    tryAllocateUd3ForCreditedIntent: vi.fn(async () => {}),
    triggerSweepPipeline: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  verifyResult = { ok: true, amount: 100_000_000n, confirmations: 12 };
});

describe('reportDepositTx idempotency (V-21)', () => {
  it('replay on an already-credited intent returns status without re-running side effects', async () => {
    const intent = {
      id: INTENT,
      wallet_address: WALLET,
      status: 'credited', // already credited
      amount_usdt: 100,
      deposit_wallet_id: 'w1',
      deposit_records: [
        { id: 'd1', status: 'credited', deposit_address: DEPOSIT_ADDR, deposit_wallet_id: 'w1' },
      ],
    };
    const { sb, calls } = makeSb({
      stake_intents: { select: intent },
      wallet_accounts: { select: { address: DEPOSIT_ADDR } },
      deposit_records: { select: { status: 'credited', tx_hash: TX, received_amount: '100' } },
    });
    const deps = makeDeps();

    const res = await reportDepositTx(sb, WALLET, INTENT, TX, deps);

    // Side effects must NOT run again.
    expect(deps.rollupPartnerPerformance).not.toHaveBeenCalled();
    expect(deps.postDepositCreditLedger).not.toHaveBeenCalled();
    expect(deps.syncStakePositionOnCredit).not.toHaveBeenCalled();
    expect(deps.triggerSweepPipeline).not.toHaveBeenCalled();
    expect(res.credited).toBe(true);

    // No credit transition UPDATE was attempted on deposit_records.
    const updates = calls.filter((c) => c.table === 'deposit_records' && c.op === 'update');
    expect(updates).toHaveLength(0);
  });

  it('first credit runs side effects and transitions with a `status <> credited` guard', async () => {
    const intent = {
      id: INTENT,
      wallet_address: WALLET,
      status: 'awaiting_payment',
      amount_usdt: 100,
      deposit_wallet_id: 'w1',
      deposit_records: [
        { id: 'd1', status: 'pending', deposit_address: DEPOSIT_ADDR, deposit_wallet_id: 'w1' },
      ],
    };
    const isDupCheck = (c: Call) => c.filters.some((f) => f[0] === 'neq' && f[1] === 'intent_id');
    const { sb, calls } = makeSb({
      // dup check (neq intent_id) returns null; the transition update returns one row.
      deposit_records: {
        select: (c: Call) => (isDupCheck(c) ? null : { status: 'credited', tx_hash: TX }),
        update: [{ id: 'd1' }],
      },
      stake_intents: { select: intent, update: null },
      wallet_accounts: { select: { address: DEPOSIT_ADDR } },
      audit_logs: { insert: null },
    });
    const deps = makeDeps();

    await reportDepositTx(sb, WALLET, INTENT, TX, deps);

    expect(deps.rollupPartnerPerformance).toHaveBeenCalledTimes(1);
    expect(deps.postDepositCreditLedger).toHaveBeenCalledTimes(1);
    // Ledger uses the intent id as the stable reference/dedupe key.
    expect((deps.postDepositCreditLedger as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject(
      { intentId: INTENT },
    );

    // The transition UPDATE carries the `status <> 'credited'` guard filter.
    const transition = calls.find((c) => c.table === 'deposit_records' && c.op === 'update');
    expect(transition).toBeDefined();
    expect(transition!.filters).toContainEqual(['neq', 'status', 'credited']);
    expect(transition!.filters).toContainEqual(['eq', 'intent_id', INTENT]);
    expect((transition!.payload as Record<string, unknown>).status).toBe('credited');
  });

  it('concurrent replay whose transition UPDATE affects zero rows skips side effects', async () => {
    const intent = {
      id: INTENT,
      wallet_address: WALLET,
      status: 'awaiting_payment', // not yet credited at read time (racing request)
      amount_usdt: 100,
      deposit_wallet_id: 'w1',
      deposit_records: [
        { id: 'd1', status: 'pending', deposit_address: DEPOSIT_ADDR, deposit_wallet_id: 'w1' },
      ],
    };
    const isDupCheck = (c: Call) => c.filters.some((f) => f[0] === 'neq' && f[1] === 'intent_id');
    const { sb } = makeSb({
      // The conditional UPDATE returns NO rows: another request already credited it.
      deposit_records: {
        select: (c: Call) => (isDupCheck(c) ? null : { status: 'credited', tx_hash: TX }),
        update: [], // zero rows transitioned
      },
      stake_intents: { select: intent },
      wallet_accounts: { select: { address: DEPOSIT_ADDR } },
    });
    const deps = makeDeps();

    await reportDepositTx(sb, WALLET, INTENT, TX, deps);

    expect(deps.rollupPartnerPerformance).not.toHaveBeenCalled();
    expect(deps.postDepositCreditLedger).not.toHaveBeenCalled();
    expect(deps.triggerSweepPipeline).not.toHaveBeenCalled();
  });

  it('the real ledger wrapper swallows a unique-violation (23505) as a benign no-op', async () => {
    // treasury_ledger insert -> .select('id').single() rejects with a Postgres
    // unique_violation, simulating treasury_ledger_dedupe_uidx firing on a replay.
    const sb = {
      from: (table: string) => {
        if (table !== 'treasury_ledger') throw new Error(`unexpected table ${table}`);
        const b: Record<string, unknown> = {
          insert: () => b,
          select: () => b,
          single: () => Promise.reject({ code: '23505', message: 'duplicate key value' }),
        };
        return b;
      },
    } as unknown as Parameters<typeof postDepositCreditLedger>[0];

    await expect(
      postDepositCreditLedger(sb, { walletAddress: WALLET, intentId: INTENT, amount: '100.00' }),
    ).resolves.toBeUndefined();
  });

  it('the real ledger wrapper rethrows non-unique-violation errors', async () => {
    const sb = {
      from: () => {
        const b: Record<string, unknown> = {
          insert: () => b,
          select: () => b,
          single: () => Promise.reject({ code: '23503', message: 'fk violation' }),
        };
        return b;
      },
    } as unknown as Parameters<typeof postDepositCreditLedger>[0];

    await expect(
      postDepositCreditLedger(sb, { walletAddress: WALLET, intentId: INTENT, amount: '100.00' }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
