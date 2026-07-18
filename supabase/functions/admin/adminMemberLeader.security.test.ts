import { describe, it, expect, vi } from 'vitest';
import {
  approveApproval,
  applyMemberSetLeader,
  requiredPermissionForApprovalAction,
  type ApproveDeps,
} from './index.ts';

const WALLET = '0x1111111111111111111111111111111111111111';

// Pending member.set_leader approval, requested by admin-1.
const pending = {
  id: 'apr-lead',
  action: 'member.set_leader',
  target_type: 'partner_accounts',
  target_id: WALLET,
  payload: { wallet: WALLET, isLeader: true, reason: 'promote' },
  requested_by: 'admin-1',
  status: 'pending',
};

function fakeSb(auditInserts: unknown[]) {
  // deno-lint-ignore no-explicit-any
  return {
    from: (table: string) => {
      if (table === 'admin_action_approvals') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: pending, error: null }) }),
          }),
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
    // deno-lint-ignore no-explicit-any
  } as any;
}

const subsidiesOnly = { userId: 'admin-2', username: 'bob', role: 'admin', permissions: ['subsidies.write'] } as never;
const membersWriter = { userId: 'admin-3', username: 'carol', role: 'admin', permissions: ['members.write'] } as never;
const sameAsRequester = { userId: 'admin-1', username: 'ann', role: 'admin', permissions: ['members.write'] } as never;

function makeDeps(overrides: Partial<ApproveDeps> = {}): ApproveDeps {
  return {
    claimApproval: vi.fn().mockResolvedValue({ ...pending, status: 'executed' }),
    applyProgramSettings: vi.fn(),
    applySubsidyTicket: vi.fn(),
    applySecurityUnpause: vi.fn(),
    applyRiskLimits: vi.fn(),
    applyMemberSetLeader: vi.fn().mockResolvedValue({
      before: { market_leader_status: 'none' },
      after: { market_leader_status: 'approved' },
      marketLeader: { wallet: WALLET, before: 'none', after: 'approved' },
    }),
    ...overrides,
  } as ApproveDeps;
}

describe('member.set_leader — checker permission mapping (R-3 extension)', () => {
  it('requires members.write to approve/reject', () => {
    expect(requiredPermissionForApprovalAction('member.set_leader')).toBe('members.write');
  });
});

describe('member.set_leader — maker-checker separation of duties', () => {
  it('rejects (403) when the approver is the same admin who requested it, applying NOTHING', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps({ claimApproval: vi.fn(), applyMemberSetLeader: vi.fn() });
    await expect(approveApproval(fakeSb(auditInserts), 'apr-lead', sameAsRequester, deps)).rejects.toMatchObject({
      status: 403,
    });
    expect(deps.claimApproval).not.toHaveBeenCalled();
    expect(deps.applyMemberSetLeader).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });

  it('rejects (403) a subsidies.write-only approver — leadership needs members.write', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps({ claimApproval: vi.fn(), applyMemberSetLeader: vi.fn() });
    await expect(approveApproval(fakeSb(auditInserts), 'apr-lead', subsidiesOnly, deps)).rejects.toMatchObject({
      status: 403,
      message: 'Missing members.write permission',
    });
    expect(deps.applyMemberSetLeader).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });

  it('a DIFFERENT members.write admin claims then applies exactly once (with eligibility audit)', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps();
    const res = await approveApproval(fakeSb(auditInserts), 'apr-lead', membersWriter, deps);
    expect(deps.claimApproval).toHaveBeenCalledTimes(1);
    expect(deps.applyMemberSetLeader).toHaveBeenCalledTimes(1);
    expect(deps.applyMemberSetLeader).toHaveBeenCalledWith(
      expect.anything(),
      WALLET,
      pending.payload,
      membersWriter,
    );
    expect((res.approval as { status: string }).status).toBe('executed');
    // One main audit row + one market_leader eligibility audit row.
    expect(auditInserts).toHaveLength(2);
  });
});

describe('applyMemberSetLeader — flips partner_accounts.market_leader_status', () => {
  // deno-lint-ignore no-explicit-any
  function acctSb(before: string | null, updated: string): any {
    return {
      from: (table: string) => {
        if (table !== 'partner_accounts') throw new Error(`unexpected ${table}`);
        return {
          select: () => ({
            ilike: () => ({
              maybeSingle: () => Promise.resolve({ data: before === null ? null : { market_leader_status: before }, error: null }),
            }),
          }),
          update: () => ({
            ilike: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve({ data: { market_leader_status: updated }, error: null }),
              }),
            }),
          }),
        };
      },
    };
  }

  it('sets approved when isLeader=true and returns the before/after marketLeader', async () => {
    const res = await applyMemberSetLeader(acctSb('none', 'approved'), WALLET, { isLeader: true });
    expect(res.marketLeader).toEqual({ wallet: WALLET, before: 'none', after: 'approved' });
  });

  it('sets none when isLeader=false', async () => {
    const res = await applyMemberSetLeader(acctSb('approved', 'none'), WALLET, { isLeader: false });
    expect(res.marketLeader).toEqual({ wallet: WALLET, before: 'approved', after: 'none' });
  });

  it('reports a no-op conflict when the member is missing', async () => {
    const res = await applyMemberSetLeader(acctSb(null, 'approved'), WALLET, { isLeader: true });
    expect(res.conflict).toBe('member_not_found');
    expect(res.marketLeader).toBeUndefined();
  });
});
