import { describe, it, expect } from 'vitest';
import {
  assertDifferentApprover,
  isPayoutAuthorizingChange,
  buildAdminAuditRow,
  writeAdminAudit,
} from '../_shared/audit.ts';

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

  it('does NOT gate cosmetic / non-payout patches', () => {
    expect(isPayoutAuthorizingChange({ adminNote: 'looks fine' })).toBe(false);
    expect(isPayoutAuthorizingChange({ assignedAdmin: 'alice' })).toBe(false);
    expect(isPayoutAuthorizingChange({ status: 'rejected' })).toBe(false);
    expect(isPayoutAuthorizingChange({ status: 'closed' })).toBe(false);
    expect(isPayoutAuthorizingChange({ marketLeaderStatus: 'approved' })).toBe(false);
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
