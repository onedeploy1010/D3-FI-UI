import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Sb = SupabaseClient;

export type NotificationCategory = 'protocol' | 'dividend' | 'multisig' | 'referral' | 'system';
export type NotifParams = Record<string, string | number>;

/**
 * Insert a templated user notification (小铃铛). Content lives in the DB
 * (notification_templates) so new reminder types + languages can be added without
 * a code deploy — this only stores the template_key + params; the fetch endpoint
 * renders title/message in the viewer's language.
 *
 * Best-effort: never throws (a failed notification must not roll back the money /
 * referral flow that triggered it). Skips silently when the recipient has no
 * profile (user_notifications.wallet_address has a FK to profiles) or the template
 * is missing/disabled.
 */
export async function notify(sb: Sb, wallet: string, key: string, params: NotifParams = {}): Promise<void> {
  try {
    const w = String(wallet ?? '').trim();
    if (!w) return;
    const { data: tmpl } = await sb
      .from('notification_templates')
      .select('category')
      .eq('key', key)
      .eq('enabled', true)
      .maybeSingle();
    const category = (tmpl as { category?: string } | null)?.category;
    if (!category) return; // unknown / disabled template
    const { data: prof } = await sb
      .from('profiles')
      .select('wallet_address')
      .ilike('wallet_address', w)
      .maybeSingle();
    const target = (prof as { wallet_address?: string } | null)?.wallet_address;
    if (!target) return;
    await sb.from('user_notifications').insert({
      wallet_address: target,
      category,
      template_key: key,
      params,
    });
  } catch {
    // notifications are non-critical.
  }
}

/** Short-form wallet for notification params (0x1234…5678). */
export function shortWalletForNotice(wallet: string): string {
  const w = String(wallet ?? '').trim();
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

/** Interpolate {param} placeholders in a template string. */
export function interpolateNotification(s: string, params: NotifParams | null | undefined): string {
  const p = params ?? {};
  return String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? String(p[k]) : `{${k}}`));
}
