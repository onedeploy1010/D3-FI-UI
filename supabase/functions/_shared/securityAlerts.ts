import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Sb = SupabaseClient;

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertStatus = 'open' | 'ack' | 'resolved';

/** Camel-case input accepted by raiseAlert (mapped to snake_case columns). */
export type AlertInput = {
  severity: Severity;
  ruleId: string;
  title: string;
  detail?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
  autoPaused?: boolean;
};

/** Row shape as stored in public.security_alerts. */
export type AlertRow = {
  id: string;
  severity: Severity;
  rule_id: string;
  title: string | null;
  detail: Record<string, unknown> | null;
  entity_type: string | null;
  entity_id: string | null;
  status: AlertStatus;
  auto_paused: boolean;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
};

export type RaiseResult = { alert: AlertRow; created: boolean };

/**
 * Insert an alert unless an `open` alert with the same rule_id already exists
 * (dedup — avoids re-raising/re-notifying the same condition every scan).
 * Returns the existing row with created=false when deduped.
 */
export async function raiseAlert(sb: Sb, input: AlertInput): Promise<RaiseResult> {
  const { data: existing, error: selErr } = await sb
    .from('security_alerts')
    .select('*')
    .eq('rule_id', input.ruleId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return { alert: existing as AlertRow, created: false };

  const row = {
    severity: input.severity,
    rule_id: input.ruleId,
    title: input.title,
    detail: input.detail ?? {},
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    status: 'open' as const,
    auto_paused: input.autoPaused ?? false,
  };

  const { data, error } = await sb
    .from('security_alerts')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return { alert: data as AlertRow, created: true };
}

/** List alerts, optionally filtered by status/severity, newest first. */
export async function listAlerts(
  sb: Sb,
  filters: { status?: AlertStatus; severity?: Severity } = {},
): Promise<AlertRow[]> {
  let q = sb.from('security_alerts').select('*').order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.severity) q = q.eq('severity', filters.severity);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AlertRow[];
}

/** Move an alert to `ack`, recording who/when. */
export async function ackAlert(sb: Sb, id: string, acknowledgedBy?: string): Promise<AlertRow> {
  const { data, error } = await sb
    .from('security_alerts')
    .update({
      status: 'ack',
      acknowledged_by: acknowledgedBy ?? null,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AlertRow;
}
