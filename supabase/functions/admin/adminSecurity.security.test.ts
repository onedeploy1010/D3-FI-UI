import { describe, it, expect, vi } from 'vitest';
import {
  approveApproval,
  type ApproveDeps,
  defaultApproveDeps,
  isKnownPauseFlag,
  sanitizeRiskLimitsPatch,
  pauseFlag,
  requestUnpause,
  requestRiskLimitsUpdate,
} from './index.ts';

// ── Chainable fake Supabase client ───────────────────────────────────────────
// Records every insert/update/upsert and answers terminal reads via a resolver.
// Mirrors just the subset of the supabase-js builder our security helpers use:
//   .select() / .insert() / .update() / .upsert() / .eq() / .order() / .limit()
//   terminated by .single() / .maybeSingle() or awaited directly (head counts).
type Op = 'select' | 'insert' | 'update' | 'upsert';
type Recorded = { table: string; op: Op; payload?: unknown; filters: Record<string, unknown> };
type Resolver = (r: Recorded) => { data?: unknown; error?: unknown; count?: number };

function makeSb(resolver: Resolver) {
  const records: Recorded[] = [];

  function builder(table: string) {
    const rec: Recorded = { table, op: 'select', filters: {} };
    const settle = () => resolve(resolver(rec));
    const resolve = (v: { data?: unknown; error?: unknown; count?: number }) =>
      Promise.resolve({ data: null, error: null, count: undefined, ...v });

    const api: Record<string, unknown> = {
      select(_cols?: unknown, _opts?: unknown) {
        return api;
      },
      insert(payload: unknown) {
        rec.op = 'insert';
        rec.payload = payload;
        records.push({ ...rec });
        return api;
      },
      update(payload: unknown) {
        rec.op = 'update';
        rec.payload = payload;
        records.push({ ...rec });
        return api;
      },
      upsert(payload: unknown, _opts?: unknown) {
        rec.op = 'upsert';
        rec.payload = payload;
        records.push({ ...rec });
        return api;
      },
      eq(col: string, val: unknown) {
        rec.filters[col] = val;
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: () => settle(),
      single: () => settle(),
      // Awaited directly (e.g. audit_logs insert, head counts).
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        settle().then(onFulfilled, onRejected),
    };
    return api;
  }

  return { sb: { from: (table: string) => builder(table) } as never, records };
}

const admin = { userId: 'admin-2', username: 'bob', role: 'superadmin', permissions: [] } as never;

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('security — isKnownPauseFlag', () => {
  it('accepts the five seeded circuit-breaker flags', () => {
    for (const f of ['flash_swap', 'deposits', 'settlement', 'treasury', 'rewards']) {
      expect(isKnownPauseFlag(f)).toBe(true);
    }
  });
  it('rejects unknown / typo flags', () => {
    expect(isKnownPauseFlag('flashswap')).toBe(false);
    expect(isKnownPauseFlag('')).toBe(false);
    expect(isKnownPauseFlag('withdrawals')).toBe(false);
  });
});

describe('security — sanitizeRiskLimitsPatch', () => {
  it('keeps only whitelisted numeric caps and drops the rest', () => {
    const patch = sanitizeRiskLimitsPatch({
      max_withdraw_per_tx_usdt: 1000,
      min_solvency_ratio: 1.2,
      id: 999,
      updated_at: 'now',
      bogus: true,
    });
    expect(patch).toEqual({ max_withdraw_per_tx_usdt: 1000, min_solvency_ratio: 1.2 });
  });
  it('returns empty object when no valid fields present', () => {
    expect(sanitizeRiskLimitsPatch({ foo: 1 })).toEqual({});
  });
});

// ── POST /security/pause — single admin, immediate ───────────────────────────
describe('security — pauseFlag flips paused=true and audits', () => {
  it('upserts paused=true and writes a before/after audit row', async () => {
    const { sb, records } = makeSb((r) => {
      if (r.table === 'system_pause_flags' && r.op === 'select') {
        return { data: { flag: 'flash_swap', paused: false, reason: null } };
      }
      if (r.table === 'system_pause_flags' && r.op === 'upsert') {
        return { data: { ...(r.payload as object), flag: 'flash_swap' } };
      }
      return { data: null };
    });

    const after = await pauseFlag(sb, 'flash_swap', 'oracle breach', admin);

    const upsert = records.find((r) => r.table === 'system_pause_flags' && r.op === 'upsert');
    expect(upsert).toBeTruthy();
    expect(upsert!.payload).toMatchObject({ flag: 'flash_swap', paused: true, reason: 'oracle breach' });
    expect((after as { paused: boolean }).paused).toBe(true);

    const audit = records.find((r) => r.table === 'audit_logs' && r.op === 'insert');
    expect(audit).toBeTruthy();
    expect((audit!.payload as { action: string }).action).toBe('security.pause');
    expect((audit!.payload as { old_value: unknown }).old_value).toMatchObject({ paused: false });
  });
});

// ── POST /security/unpause — maker-checker (does NOT flip the flag) ───────────
describe('security — requestUnpause creates a pending approval only', () => {
  it('inserts a pending security.unpause approval and never writes system_pause_flags', async () => {
    const { sb, records } = makeSb((r) => {
      if (r.table === 'admin_action_approvals' && r.op === 'insert') {
        return { data: { id: 'apr-9', status: 'pending', ...(r.payload as object) } };
      }
      return { data: null };
    });

    const approval = await requestUnpause(sb, 'flash_swap', 'recovered', admin);

    expect((approval as { status: string }).status).toBe('pending');
    const insertedApproval = records.find(
      (r) => r.table === 'admin_action_approvals' && r.op === 'insert',
    );
    expect(insertedApproval!.payload).toMatchObject({
      action: 'security.unpause',
      target_type: 'system_pause_flags',
      target_id: 'flash_swap',
      status: 'pending',
    });
    // The circuit-breaker itself must NOT be mutated at request time.
    const flagWrite = records.find(
      (r) => r.table === 'system_pause_flags' && (r.op === 'update' || r.op === 'upsert'),
    );
    expect(flagWrite).toBeUndefined();
  });
});

// ── PATCH /security/limits — maker-checker ───────────────────────────────────
describe('security — requestRiskLimitsUpdate goes through approval', () => {
  it('creates a risk_limits.update approval carrying the sanitized patch', async () => {
    const { sb, records } = makeSb((r) => {
      if (r.table === 'risk_limits' && r.op === 'select') {
        return { data: { id: 1, max_withdraw_per_tx_usdt: 2000 } };
      }
      if (r.table === 'admin_action_approvals' && r.op === 'insert') {
        return { data: { id: 'apr-10', status: 'pending', ...(r.payload as object) } };
      }
      return { data: null };
    });

    const patch = { max_withdraw_per_tx_usdt: 1234 };
    const approval = await requestRiskLimitsUpdate(sb, patch, admin);

    expect((approval as { status: string }).status).toBe('pending');
    const inserted = records.find((r) => r.table === 'admin_action_approvals' && r.op === 'insert');
    expect(inserted!.payload).toMatchObject({
      action: 'risk_limits.update',
      target_type: 'risk_limits',
      target_id: '1',
      payload: patch,
    });
    // No direct write to risk_limits at request time.
    expect(records.find((r) => r.table === 'risk_limits' && r.op === 'update')).toBeUndefined();
  });
});

// ── Approval executor dispatch for the two new actions ───────────────────────
describe('security — approveApproval dispatches security.unpause (claim-first TOCTOU)', () => {
  const pending = {
    id: 'apr-1',
    action: 'security.unpause',
    target_type: 'system_pause_flags',
    target_id: 'flash_swap',
    payload: { flag: 'flash_swap', reason: 'recovered' },
    requested_by: 'admin-1',
    status: 'pending',
  };

  function fakeSb(auditInserts: unknown[]) {
    return {
      from: (table: string) => {
        if (table === 'admin_action_approvals') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: pending, error: null }) }) }),
          };
        }
        if (table === 'audit_logs') {
          return {
            insert: (payload: unknown) => {
              auditInserts.push(payload);
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never;
  }

  it('claim WINS → applySecurityUnpause runs once and the change is audited', async () => {
    const auditInserts: unknown[] = [];
    const applySecurityUnpause = vi.fn().mockResolvedValue({
      before: { flag: 'flash_swap', paused: true },
      after: { flag: 'flash_swap', paused: false },
    });
    const deps: ApproveDeps = {
      claimApproval: vi.fn().mockResolvedValue({ ...pending, status: 'executed' }),
      applyProgramSettings: vi.fn(),
      applySubsidyTicket: vi.fn(),
      applySecurityUnpause,
      applyRiskLimits: vi.fn(),
    };

    const res = await approveApproval(fakeSb(auditInserts), 'apr-1', admin, deps);

    expect(deps.claimApproval).toHaveBeenCalledTimes(1);
    expect(applySecurityUnpause).toHaveBeenCalledTimes(1);
    expect(applySecurityUnpause).toHaveBeenCalledWith(expect.anything(), pending.payload, admin);
    expect(deps.applyRiskLimits).not.toHaveBeenCalled();
    expect((res.approval as { status: string }).status).toBe('executed');
    expect(auditInserts).toHaveLength(1);
    expect((auditInserts[0] as { action: string }).action).toBe('security.unpause');
  });

  it('claim LOST (0 rows) → 409 and applies NOTHING (no flip, no audit)', async () => {
    const auditInserts: unknown[] = [];
    const applySecurityUnpause = vi.fn();
    const deps: ApproveDeps = {
      claimApproval: vi.fn().mockResolvedValue(null),
      applyProgramSettings: vi.fn(),
      applySubsidyTicket: vi.fn(),
      applySecurityUnpause,
      applyRiskLimits: vi.fn(),
    };

    await expect(approveApproval(fakeSb(auditInserts), 'apr-1', admin, deps)).rejects.toMatchObject({
      status: 409,
      message: 'Approval already processed',
    });
    expect(applySecurityUnpause).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });
});

// ── Default appliers actually mutate the target rows ─────────────────────────
describe('security — defaultApproveDeps appliers mutate the right rows', () => {
  it('applySecurityUnpause sets paused=false for the payload flag', async () => {
    const { sb, records } = makeSb((r) => {
      if (r.table === 'system_pause_flags' && r.op === 'select') {
        return { data: { flag: 'flash_swap', paused: true } };
      }
      if (r.table === 'system_pause_flags' && r.op === 'update') {
        return { data: { flag: 'flash_swap', ...(r.payload as object) } };
      }
      return { data: null };
    });

    const res = await defaultApproveDeps.applySecurityUnpause(
      sb,
      { flag: 'flash_swap', reason: 'recovered' },
      admin,
    );

    const update = records.find((r) => r.table === 'system_pause_flags' && r.op === 'update');
    expect(update!.payload).toMatchObject({ paused: false, reason: 'recovered' });
    expect(update!.filters).toMatchObject({ flag: 'flash_swap' });
    expect((res.after as { paused: boolean }).paused).toBe(false);
  });

  it('applyRiskLimits patches the singleton row id=1', async () => {
    const { sb, records } = makeSb((r) => {
      if (r.table === 'risk_limits' && r.op === 'select') {
        return { data: { id: 1, max_withdraw_per_tx_usdt: 2000 } };
      }
      if (r.table === 'risk_limits' && r.op === 'update') {
        return { data: { id: 1, ...(r.payload as object) } };
      }
      return { data: null };
    });

    const res = await defaultApproveDeps.applyRiskLimits(sb, { max_withdraw_per_tx_usdt: 1234 }, admin);

    const update = records.find((r) => r.table === 'risk_limits' && r.op === 'update');
    expect(update!.payload).toMatchObject({ max_withdraw_per_tx_usdt: 1234 });
    expect(update!.filters).toMatchObject({ id: 1 });
    expect((res.after as { max_withdraw_per_tx_usdt: number }).max_withdraw_per_tx_usdt).toBe(1234);
  });
});
