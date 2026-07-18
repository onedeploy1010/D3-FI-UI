import { describe, it, expect, vi, beforeEach } from 'vitest';

// Heavy chain deps: turnkey pulls an esm.sh import and wallets reaches on-chain.
// Mock both so fundManagement loads under Node and we control signing/treasury.
const { submitMock, pollMock, treasuryMock, broadcastMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  pollMock: vi.fn(),
  treasuryMock: vi.fn(),
  broadcastMock: vi.fn(),
}));

vi.mock('./turnkey.ts', () => ({
  submitTreasuryTransfer: submitMock,
  pollTurnkeyActivity: pollMock,
  broadcastSignedTransaction: broadcastMock,
  getBscPublicClient: vi.fn(),
  walletContextFromDbRow: (row: { address: string; metadata?: { provider?: string; hd_index?: number } | null }) => ({
    address: row.address,
    provider: row.metadata?.provider === 'dev_hd' ? 'dev_hd' : 'turnkey',
    hdIndex: row.metadata?.hd_index,
  }),
}));
vi.mock('./wallets.ts', () => ({ getTreasuryWallet: treasuryMock }));

import {
  assertTreasuryDevSigningAllowed,
  assertTransferAmountWithinMax,
  assertDailyCapNotExceeded,
  isTreasuryDestinationAllowlisted,
  proposeTreasuryTransfer,
  broadcastTreasuryTransfer,
} from './fundManagement.ts';
import { adminHasPermission } from './adminAuth.ts';

const VALID_TO = '0x1111111111111111111111111111111111111111';
const TREASURY = '0x2222222222222222222222222222222222222222';

// Configurable fake Supabase: routes keyed by `${table}:${op}`.
// deno-lint-ignore no-explicit-any
function makeSb(routes: Record<string, any>): any {
  function builder(table: string) {
    // deno-lint-ignore no-explicit-any
    const state: any = { table, op: 'select', filters: {} };
    const resolve = () => {
      const r = routes[`${table}:${state.op}`];
      const val = typeof r === 'function' ? r(state) : r;
      return Promise.resolve(val ?? { data: null, error: null });
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      // deno-lint-ignore no-explicit-any
      insert: (v: any) => ((state.op = 'insert'), (state.values = v), b),
      // deno-lint-ignore no-explicit-any
      update: (v: any) => ((state.op = 'update'), (state.values = v), b),
      // deno-lint-ignore no-explicit-any
      upsert: (v: any) => ((state.op = 'upsert'), (state.values = v), b),
      delete: () => ((state.op = 'delete'), b),
      // deno-lint-ignore no-explicit-any
      eq: (k: string, v: any) => ((state.filters[k] = v), b),
      // deno-lint-ignore no-explicit-any
      ilike: (k: string, v: any) => ((state.filters[k] = v), b),
      gte: () => b,
      lte: () => b,
      or: () => b,
      order: () => b,
      limit: () => b,
      range: () => resolve(),
      maybeSingle: () => resolve(),
      single: () => resolve(),
      // deno-lint-ignore no-explicit-any
      then: (onF: any, onR: any) => resolve().then(onF, onR),
    };
    return b;
  }
  return { from: builder };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ALLOW_DEV_TREASURY;
  delete process.env.TREASURY_MAX_TRANSFER_USDT;
  delete process.env.TREASURY_DAILY_CAP_USDT;
});

describe('T-C — treasury dev_hd signing hard-guard', () => {
  it('throws 503 when a dev_hd wallet signs and ALLOW_DEV_TREASURY is unset', () => {
    expect(() => assertTreasuryDevSigningAllowed('dev_hd')).toThrow();
    try {
      assertTreasuryDevSigningAllowed('dev_hd');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(503);
      expect((e as Error).message).toBe('Treasury dev signing disabled');
    }
  });

  it('allows dev_hd only with the explicit ALLOW_DEV_TREASURY=true opt-in', () => {
    process.env.ALLOW_DEV_TREASURY = 'true';
    expect(() => assertTreasuryDevSigningAllowed('dev_hd')).not.toThrow();
  });

  it('never blocks a real turnkey wallet', () => {
    expect(() => assertTreasuryDevSigningAllowed('turnkey')).not.toThrow();
  });

  it('propose refuses a dev_hd treasury by default (503)', async () => {
    treasuryMock.mockResolvedValue({ id: 'w', address: TREASURY, metadata: { provider: 'dev_hd', hd_index: 0 } });
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: null } });
    await expect(
      proposeTreasuryTransfer(sb, { asset: 'usdt', toAddress: VALID_TO, amount: 10, requestKey: 'k', proposedBy: 'a1' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe('T-A — treasury.write is a distinct permission (not members.write)', () => {
  const membersOnly = { userId: 'a', username: 'x', role: 'admin', permissions: ['members.write'] } as never;
  const treasuryWriter = { userId: 'b', username: 'y', role: 'admin', permissions: ['treasury.write'] } as never;
  const superadmin = { userId: 'c', username: 'z', role: 'superadmin', permissions: [] } as never;

  it('a members.write-only admin does NOT have treasury.write', () => {
    expect(adminHasPermission(membersOnly, 'treasury.write')).toBe(false);
  });
  it('a treasury.write admin does', () => {
    expect(adminHasPermission(treasuryWriter, 'treasury.write')).toBe(true);
  });
  it('superadmin bypasses', () => {
    expect(adminHasPermission(superadmin, 'treasury.write')).toBe(true);
  });
});

describe('T-D — per-transfer max, daily cap, and destination allowlist', () => {
  it('rejects a usdt transfer above the per-tx max (default 50k)', () => {
    expect(() => assertTransferAmountWithinMax('usdt', 50_001)).toThrow();
    expect(() => assertTransferAmountWithinMax('usdt', 50_000)).not.toThrow();
  });

  it('honors a custom TREASURY_MAX_TRANSFER_USDT', () => {
    process.env.TREASURY_MAX_TRANSFER_USDT = '100';
    expect(() => assertTransferAmountWithinMax('usdt', 150)).toThrow();
    try {
      assertTransferAmountWithinMax('usdt', 150);
    } catch (e) {
      expect((e as { status?: number }).status).toBe(400);
    }
  });

  it('does not apply the USDT max to a native bnb top-up', () => {
    expect(() => assertTransferAmountWithinMax('bnb', 999_999)).not.toThrow();
  });

  it('rejects when today+amount would exceed the daily cap', () => {
    process.env.TREASURY_DAILY_CAP_USDT = '1000';
    expect(() => assertDailyCapNotExceeded('usdt', 900, 200)).toThrow();
    expect(() => assertDailyCapNotExceeded('usdt', 900, 100)).not.toThrow();
    expect(() => assertDailyCapNotExceeded('bnb', 900, 200)).not.toThrow();
  });

  it('isTreasuryDestinationAllowlisted reflects the table', async () => {
    expect(
      await isTreasuryDestinationAllowlisted(makeSb({ 'treasury_transfer_allowlist:select': { data: null } }), VALID_TO),
    ).toBe(false);
    expect(
      await isTreasuryDestinationAllowlisted(
        makeSb({ 'treasury_transfer_allowlist:select': { data: { address: VALID_TO } } }),
        VALID_TO,
      ),
    ).toBe(true);
  });

  it('propose rejects a non-allowlisted destination (403) with NO turnkey activity', async () => {
    treasuryMock.mockResolvedValue({ id: 'w', address: TREASURY, metadata: { provider: 'turnkey' } });
    const sb = makeSb({
      'treasury_transfer_requests:select': { data: null }, // dedup miss
      'treasury_transfer_allowlist:select': { data: null }, // not allowlisted
    });
    await expect(
      proposeTreasuryTransfer(sb, { asset: 'usdt', toAddress: VALID_TO, amount: 10, requestKey: 'k', proposedBy: 'a1' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('propose rejects an over-max amount (400) before any allowlist/turnkey work', async () => {
    process.env.TREASURY_MAX_TRANSFER_USDT = '100';
    treasuryMock.mockResolvedValue({ id: 'w', address: TREASURY, metadata: { provider: 'turnkey' } });
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: null } });
    await expect(
      proposeTreasuryTransfer(sb, { asset: 'usdt', toAddress: VALID_TO, amount: 150, requestKey: 'k', proposedBy: 'a1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe('T-E — idempotency: a duplicate requestKey returns the existing row', () => {
  it('returns the existing request and does NOT sign again', async () => {
    const existing = { id: 't1', request_key: 'k1', status: 'awaiting_consensus', to_address: VALID_TO };
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: existing } });
    const row = await proposeTreasuryTransfer(sb, {
      asset: 'usdt',
      toAddress: VALID_TO,
      amount: 100,
      requestKey: 'k1',
      proposedBy: 'a1',
    });
    expect(row).toEqual(existing);
    expect(submitMock).not.toHaveBeenCalled();
    expect(treasuryMock).not.toHaveBeenCalled();
  });

  it('requires a requestKey', async () => {
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: null } });
    await expect(
      proposeTreasuryTransfer(sb, { asset: 'usdt', toAddress: VALID_TO, amount: 100, requestKey: '', proposedBy: 'a1' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('T-B — broadcast is maker-checker: proposer may not broadcast', () => {
  const row = { id: 't1', status: 'awaiting_consensus', proposed_by: 'admin-1', turnkey_activity_id: 'act1' };

  it('rejects when the broadcaster equals the proposer (403) and never polls turnkey', async () => {
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: row } });
    await expect(broadcastTreasuryTransfer(sb, 't1', 'admin-1')).rejects.toMatchObject({ status: 403 });
    expect(pollMock).not.toHaveBeenCalled();
  });

  it('lets a DIFFERENT admin past the maker-checker gate (then proceeds to poll)', async () => {
    pollMock.mockResolvedValue({ status: 'ACTIVITY_STATUS_PENDING' });
    const sb = makeSb({ 'treasury_transfer_requests:select': { data: row } });
    await expect(broadcastTreasuryTransfer(sb, 't1', 'admin-2')).rejects.toThrow();
    // Proof it cleared separation-of-duties: the poll was reached.
    expect(pollMock).toHaveBeenCalledTimes(1);
  });
});
