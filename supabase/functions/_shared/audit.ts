import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type AuditInput = {
  actorType: 'system' | 'admin' | 'turnkey_policy' | 'webhook';
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
