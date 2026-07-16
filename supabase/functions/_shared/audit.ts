import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './wallet.ts';

// audit_logs.actor_type CHECK constraint (migration 012) allows exactly this set.
// Keeping the TS union in lockstep with the DB check avoids inserting a value the
// database would reject at runtime.
export type AuditActorType = 'system' | 'admin' | 'turnkey_policy' | 'webhook';

type AuditInput = {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
};

export async function writeAuditLog(sb: SupabaseClient, input: AuditInput) {
  await sb.from('audit_logs').insert({
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    ip_address: input.ipAddress ?? null,
  });
}

// ── V-08: admin audit trail + maker-checker ──────────────────────────────────

export type AdminAuditInput = {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

/**
 * Build the immutable audit_logs row for a privileged admin mutation.
 *
 * audit_logs has fixed columns (id, actor_type, actor_id, action, entity_type,
 * entity_id, old_value jsonb, new_value jsonb, ip_address, created_at) and is
 * append-only (migration 036). It has no dedicated `reason` / `actor_role`
 * columns and we must not alter it, so those two fields are folded into the
 * jsonb new_value envelope alongside the after-state. This keeps every forensic
 * detail in one row without schema drift. Exported for testing.
 */
export function buildAdminAuditRow(input: AdminAuditInput) {
  return {
    actor_type: 'admin' as const,
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    old_value: input.before ?? null,
    // Envelope: after-state + who (role) + why (reason). before-state stays clean.
    new_value: {
      after: input.after ?? null,
      actorRole: input.actorRole,
      reason: input.reason ?? null,
    },
    ip_address: null,
  };
}

/** Insert an immutable audit row for an admin mutation (actor_type = 'admin'). */
export async function writeAdminAudit(sb: SupabaseClient, input: AdminAuditInput) {
  await sb.from('audit_logs').insert(buildAdminAuditRow(input));
}

/**
 * Maker-checker classification: does this intended change authorize a future or
 * immediate payout, and therefore require a second admin's approval?
 *
 * Two payout-authorizing surfaces exist in admin/index.ts:
 *  - program-settings reward RATE fields (partnerSubsidyRatePct / marketSubsidyRatePct)
 *    — they scale every future subsidy payout.
 *  - flipping a subsidy ticket to an `approved` or `paid` state — that authorizes
 *    the actual disbursement of that ticket.
 * Everything else (admin notes, assignment, cosmetic status like rejected/closed,
 * market-leader flags) is NOT payout-authorizing and may be applied directly.
 */
export function isPayoutAuthorizingChange(patch: Record<string, unknown>): boolean {
  if (patch.partnerSubsidyRatePct != null || patch.marketSubsidyRatePct != null) {
    return true;
  }
  if (typeof patch.status === 'string' && (patch.status === 'approved' || patch.status === 'paid')) {
    return true;
  }
  return false;
}

/**
 * Maker-checker separation-of-duties guard: the approving admin must never be the
 * same person who requested the action. Throws HttpError(403) otherwise.
 */
export function assertDifferentApprover(requesterId: string, approverId: string): void {
  if (!requesterId || !approverId || requesterId === approverId) {
    throw new HttpError(403, 'Approver must differ from requester');
  }
}
