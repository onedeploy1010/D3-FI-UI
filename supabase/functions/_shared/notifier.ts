import type { AlertInput, Severity } from './securityAlerts.ts';

/**
 * Alert push notifier (Telegram / Slack).
 *
 * Fail-soft by design: a notifier error must NEVER break the security scan, so
 * every network path is wrapped in try/catch and only logged. Messages are
 * built from a whitelist of monitoring fields — secrets / keys / JWTs / DB
 * credentials are never interpolated into the outgoing text.
 */

/** Highest-to-lowest severity ordering: P0 > P1 > P2 > P3. */
const SEVERITY_ORDER: Record<Severity, number> = { P0: 3, P1: 2, P2: 1, P3: 0 };

/** Pure, testable: does `sev` meet-or-exceed the `min` threshold? */
export function meetsSeverityThreshold(sev: Severity, min: Severity): boolean {
  const s = SEVERITY_ORDER[sev];
  const m = SEVERITY_ORDER[min] ?? SEVERITY_ORDER.P1;
  if (s === undefined) return false;
  return s >= m;
}

/** Minimum severity to push, from env (default P1). */
function minSeverity(): Severity {
  const raw = (Deno.env.get('SECURITY_ALERT_MIN_SEVERITY') ?? 'P1').trim().toUpperCase();
  return raw === 'P0' || raw === 'P1' || raw === 'P2' || raw === 'P3' ? raw : 'P1';
}

/**
 * Pure, testable: render an alert to a plain-text message. Only whitelisted,
 * non-sensitive fields are included. `detail` is our own monitoring JSON (never
 * carries secrets), but we cap its size defensively.
 */
export function formatAlertMessage(alert: AlertInput): string {
  const lines = [
    `[${alert.severity}] ${alert.title}`,
    `rule: ${alert.ruleId}`,
  ];
  if (alert.entityType) {
    lines.push(`entity: ${alert.entityType}${alert.entityId ? `/${alert.entityId}` : ''}`);
  }
  if (alert.autoPaused) lines.push('action: auto-paused flash_swap');
  if (alert.detail && Object.keys(alert.detail).length > 0) {
    let detailStr: string;
    try {
      detailStr = JSON.stringify(alert.detail);
    } catch {
      detailStr = '[unserializable]';
    }
    if (detailStr.length > 800) detailStr = detailStr.slice(0, 800) + '…';
    lines.push(`detail: ${detailStr}`);
  }
  return lines.join('\n');
}

export type NotifyDeps = {
  fetchImpl: typeof fetch;
  log: (msg: string) => void;
};

const DEFAULT_DEPS: NotifyDeps = {
  fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
  log: (msg: string) => console.log(msg),
};

export type NotifyResult = { sent: boolean; channels: string[]; skipped?: string };

/**
 * Push an alert to configured channels when its severity meets the threshold.
 * No-op (logs) when below threshold or when no channel is configured. Never
 * throws — individual channel failures are caught and logged.
 */
export async function notify(alert: AlertInput, deps: NotifyDeps = DEFAULT_DEPS): Promise<NotifyResult> {
  const min = minSeverity();
  if (!meetsSeverityThreshold(alert.severity, min)) {
    return { sent: false, channels: [], skipped: `below-threshold (${alert.severity} < ${min})` };
  }

  const text = formatAlertMessage(alert);
  const channels: string[] = [];

  const tgToken = Deno.env.get('SECURITY_TELEGRAM_BOT_TOKEN');
  const tgChat = Deno.env.get('SECURITY_TELEGRAM_CHAT_ID');
  const slackUrl = Deno.env.get('SECURITY_SLACK_WEBHOOK_URL');

  if (tgToken && tgChat) {
    try {
      await deps.fetchImpl(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
      });
      channels.push('telegram');
    } catch (e) {
      // Fail-soft: never surface the URL (it embeds the bot token) in the log.
      deps.log(`notifier: telegram push failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  if (slackUrl) {
    try {
      await deps.fetchImpl(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      channels.push('slack');
    } catch (e) {
      deps.log(`notifier: slack push failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  if (channels.length === 0) {
    deps.log(`notifier: no channel configured, alert not pushed (${alert.severity} ${alert.ruleId})`);
    return { sent: false, channels: [], skipped: 'no-channel-configured' };
  }
  return { sent: true, channels };
}
