import { describe, it, expect, vi } from 'vitest';
import {
  assertDifferentApprover,
  isPayoutAuthorizingChange,
  buildAdminAuditRow,
  writeAdminAudit,
} from '../_shared/audit.ts';
import {
  approveApproval,
  rejectApproval,
  requiredPermissionForApprovalAction,
  type ApproveDeps,
} from './index.ts';

describe('V-08 maker-checker — assertDifferentApprover (separation of duties)', () => {
  it('throws 403 when approver equals requester', () => {
    expect(() => assertDifferentApprover('admin-1', 'admin-1')).toThrow();
    try {
      assertDifferentApprover('admin-1', 'admin-1');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403);
      expect((e as Error).message).toBe('Approver must differ from requester');
    }
  });

  it('throws 403 when either id is empty', () => {
    expect(() => assertDifferentApprover('', 'admin-2')).toThrow();
    expect(() => assertDifferentApprover('admin-1', '')).toThrow();
  });

  it('does not throw when approver differs from requester', () => {
    expect(() => assertDifferentApprover('admin-1', 'admin-2')).not.toThrow();
  });
});

describe('V-08 maker-checker — isPayoutAuthorizingChange (field classification)', () => {
  it('gates a program-settings reward RATE change', () => {
    expect(isPayoutAuthorizingChange({ partnerSubsidyRatePct: 12 })).toBe(true);
    expect(isPayoutAuthorizingChange({ marketSubsidyRatePct: 7 })).toBe(true);
  });

  it('gates a subsidy ticket flipped to approved or paid', () => {
    expect(isPayoutAuthorizingChange({ status: 'approved' })).toBe(true);
    expect(isPayoutAuthorizingChange({ status: 'paid' })).toBe(true);
  });

  it('gates a marketLeaderStatus flipped to an eligibility-granting value', () => {
    // Residual 1: granting market-leader eligibility drives future subsidy quota
    // and is therefore payout-authorizing -> must clear maker-checker.
    expect(isPayoutAuthorizingChange({ marketLeaderStatus: 'approved' })).toBe(true);
  });

  it('does NOT gate cosmetic / non-payout patches', () => {
    expect(isPayoutAuthorizingChange({ adminNote: 'looks fine' })).toBe(false);
    expect(isPayoutAuthorizingChange({ assignedAdmin: 'alice' })).toBe(false);
    expect(isPayoutAuthorizingChange({ status: 'rejected' })).toBe(false);
    expect(isPayoutAuthorizingChange({ status: 'closed' })).toBe(false);
    // Non-eligibility market-leader transitions grant nothing -> not gated.
    expect(isPayoutAuthorizingChange({ marketLeaderStatus: 'rejected' })).toBe(false);
    expect(isPayoutAuthorizingChange({ marketLeaderStatus: 'none' })).toBe(false);
    expect(isPayoutAuthorizingChange({})).toBe(false);
  });
});

describe('V-08 admin audit — writeAdminAudit builds the correct immutable row', () => {
  it('builds actor_type=admin row with before as old_value and after+role+reason envelope', () => {
    const row = buildAdminAuditRow({
      actorId: 'admin-1',
      actorRole: 'superadmin',
      action: 'subsidy_ticket.patch',
      entityType: 'partner_subsidy_tickets',
      entityId: 'tkt-42',
      before: { status: 'open' },
      after: { status: 'paid' },
      reason: 'maker-checker approved',
    });
    expect(row).toEqual({
      actor_type: 'admin',
      actor_id: 'admin-1',
      action: 'subsidy_ticket.patch',
      entity_type: 'partner_subsidy_tickets',
      entity_id: 'tkt-42',
      old_value: { status: 'open' },
      new_value: {
        after: { status: 'paid' },
        actorRole: 'superadmin',
        reason: 'maker-checker approved',
      },
      ip_address: null,
    });
  });

  it('defaults before/after/reason to null', () => {
    const row = buildAdminAuditRow({
      actorId: 'admin-2',
      actorRole: 'admin',
      action: 'program_settings.update',
      entityType: 'partner_program_settings',
      entityId: '1',
    });
    expect(row.old_value).toBeNull();
    expect(row.new_value).toEqual({ after: null, actorRole: 'admin', reason: null });
  });

  it('inserts exactly one row into audit_logs via the client', async () => {
    const inserts: Array<{ table: string; payload: unknown }> = [];
    // deno-lint-ignore no-explicit-any
    const sb: any = {
      from: (table: string) => ({
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    await writeAdminAudit(sb, {
      actorId: 'admin-9',
      actorRole: 'support',
      action: 'subsidy_ticket.message',
      entityType: 'partner_subsidy_tickets',
      entityId: 'tkt-1',
      after: { body: 'hi' },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('audit_logs');
    expect((inserts[0].payload as { actor_type: string }).actor_type).toBe('admin');
    expect((inserts[0].payload as { actor_id: string }).actor_id).toBe('admin-9');
  });
});

describe('R-3 — requiredPermissionForApprovalAction (checker perm matches action)', () => {
  it('maps security.* actions to security.write', () => {
    expect(requiredPermissionForApprovalAction('security.unpause')).toBe('security.write');
  });
  it('maps risk_limits.* actions to security.write', () => {
    expect(requiredPermissionForApprovalAction('risk_limits.update')).toBe('security.write');
  });
  it('keeps subsidy/program actions on subsidies.write', () => {
    expect(requiredPermissionForApprovalAction('subsidy_ticket.patch')).toBe('subsidies.write');
    expect(requiredPermissionForApprovalAction('program_settings.update')).toBe('subsidies.write');
  });
});

describe('R-3 — approve/reject of a security action require security.write (not subsidies.write)', () => {
  const pending = {
    id: 'apr-sec',
    action: 'security.unpause',
    target_type: 'system_pause_flags',
    target_id: 'flash_swap',
    payload: { flag: 'flash_swap', reason: 'recovered' },
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

  const subsidiesOnly = {
    userId: 'admin-2', username: 'bob', role: 'admin', permissions: ['subsidies.write'],
  } as never;
  const securityWriter = {
    userId: 'admin-3', username: 'carol', role: 'admin', permissions: ['security.write'],
  } as never;
  const superadmin = {
    userId: 'admin-4', username: 'dave', role: 'superadmin', permissions: [],
  } as never;

  function makeDeps(overrides: Partial<ApproveDeps> = {}): ApproveDeps {
    return {
      claimApproval: vi.fn().mockResolvedValue({ ...pending, status: 'executed' }),
      applyProgramSettings: vi.fn(),
      applySubsidyTicket: vi.fn(),
      applySecurityUnpause: vi.fn().mockResolvedValue({ before: { paused: true }, after: { paused: false } }),
      applyRiskLimits: vi.fn(),
      ...overrides,
    };
  }

  it('approveApproval → 403 for a subsidies.write-only approver, and claims/applies NOTHING', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps({ claimApproval: vi.fn(), applySecurityUnpause: vi.fn() });

    await expect(
      approveApproval(fakeSb(auditInserts), 'apr-sec', subsidiesOnly, deps),
    ).rejects.toMatchObject({ status: 403, message: 'Missing security.write permission' });

    expect(deps.claimApproval).not.toHaveBeenCalled();
    expect(deps.applySecurityUnpause).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });

  it('approveApproval → security.write approver passes (claim + apply run once)', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps();

    const res = await approveApproval(fakeSb(auditInserts), 'apr-sec', securityWriter, deps);

    expect(deps.claimApproval).toHaveBeenCalledTimes(1);
    expect(deps.applySecurityUnpause).toHaveBeenCalledTimes(1);
    expect((res.approval as { status: string }).status).toBe('executed');
    expect(auditInserts).toHaveLength(1);
  });

  it('approveApproval → superadmin bypasses the permission gate', async () => {
    const auditInserts: unknown[] = [];
    const deps = makeDeps();

    await approveApproval(fakeSb(auditInserts), 'apr-sec', superadmin, deps);

    expect(deps.applySecurityUnpause).toHaveBeenCalledTimes(1);
  });

  it('rejectApproval → 403 for a subsidies.write-only approver on a security action', async () => {
    const auditInserts: unknown[] = [];

    await expect(
      rejectApproval(fakeSb(auditInserts), 'apr-sec', subsidiesOnly, 'nope'),
    ).rejects.toMatchObject({ status: 403, message: 'Missing security.write permission' });

    expect(auditInserts).toHaveLength(0);
  });
});

describe('V-08 maker-checker — approveApproval claims the row BEFORE applying (TOCTOU)', () => {
  const admin = { userId: 'admin-2', username: 'bob', role: 'superadmin' } as never;
  const pending = {
    id: 'apr-1',
    action: 'subsidy_ticket.patch',
    target_type: 'partner_subsidy_tickets',
    target_id: 'tkt-9',
    payload: { status: 'approved' },
    requested_by: 'admin-1',
    status: 'pending',
  };

  // Minimal client: loadPendingApproval reads the pending row; writeAdminAudit
  // inserts into audit_logs. No .update() path is exercised because claimApproval
  // is injected as a fake below.
  function fakeSb(auditInserts: unknown[]) {
    // deno-lint-ignore no-explicit-any
    return {
      from: (table: string) => {
        if (table === 'admin_action_approvals') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: pending, error: null }),
              }),
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

  it('returns 409 and applies NOTHING when the atomic claim loses the race (0 rows)', async () => {
    const auditInserts: unknown[] = [];
    const applySubsidyTicket = vi.fn();
    const applyProgramSettings = vi.fn();
    const deps: ApproveDeps = {
      claimApproval: vi.fn().mockResolvedValue(null), // lost the race -> null
      applySubsidyTicket,
      applyProgramSettings,
    };

    await expect(
      approveApproval(fakeSb(auditInserts), 'apr-1', admin, deps),
    ).rejects.toMatchObject({ status: 409, message: 'Approval already processed' });

    expect(deps.claimApproval).toHaveBeenCalledTimes(1);
    expect(applySubsidyTicket).not.toHaveBeenCalled();
    expect(applyProgramSettings).not.toHaveBeenCalled();
    expect(auditInserts).toHaveLength(0);
  });

  it('applies the side effect exactly once when the claim wins (1 row)', async () => {
    const auditInserts: unknown[] = [];
    const applySubsidyTicket = vi.fn().mockResolvedValue({
      before: { id: 'tkt-9', status: 'under_review' },
      after: { id: 'tkt-9', status: 'approved' },
      marketLeader: null,
    });
    const applyProgramSettings = vi.fn();
    const deps: ApproveDeps = {
      claimApproval: vi.fn().mockResolvedValue({ ...pending, status: 'executed' }),
      applySubsidyTicket,
      applyProgramSettings,
    };

    const res = await approveApproval(fakeSb(auditInserts), 'apr-1', admin, deps);

    // claim happened before apply, and apply ran exactly once.
    expect(deps.claimApproval).toHaveBeenCalledTimes(1);
    expect(applySubsidyTicket).toHaveBeenCalledTimes(1);
    expect(applySubsidyTicket).toHaveBeenCalledWith(
      expect.anything(),
      'tkt-9',
      { status: 'approved' },
      admin,
    );
    expect(applyProgramSettings).not.toHaveBeenCalled();
    expect((res.approval as { status: string }).status).toBe('executed');
    expect(auditInserts).toHaveLength(1);
  });

  it('records a no-op conflict (not a re-flip) when the ticket is already paid on execute', async () => {
    const auditInserts: unknown[] = [];
    const applySubsidyTicket = vi.fn().mockResolvedValue({
      before: { id: 'tkt-9', status: 'paid' },
      after: { id: 'tkt-9', status: 'paid' },
      conflict: 'already_paid',
    });
    const deps: ApproveDeps = {
      claimApproval: vi.fn().mockResolvedValue({ ...pending, status: 'executed' }),
      applySubsidyTicket,
      applyProgramSettings: vi.fn(),
    };

    await approveApproval(fakeSb(auditInserts), 'apr-1', admin, deps);

    expect(auditInserts).toHaveLength(1);
    const row = auditInserts[0] as { new_value: { reason: string } };
    expect(row.new_value.reason).toContain('already_paid');
    expect(row.new_value.reason).toContain('no-op');
  });
});
