import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { meetsSeverityThreshold, formatAlertMessage, notify, type NotifyDeps } from './notifier.ts';
import type { AlertInput } from './securityAlerts.ts';

describe('meetsSeverityThreshold — ordering P0 > P1 > P2 > P3', () => {
  it('equal severity meets threshold', () => {
    expect(meetsSeverityThreshold('P1', 'P1')).toBe(true);
  });
  it('higher severity meets a lower threshold', () => {
    expect(meetsSeverityThreshold('P0', 'P1')).toBe(true);
    expect(meetsSeverityThreshold('P0', 'P3')).toBe(true);
  });
  it('lower severity does NOT meet a higher threshold', () => {
    expect(meetsSeverityThreshold('P2', 'P1')).toBe(false);
    expect(meetsSeverityThreshold('P3', 'P0')).toBe(false);
  });
  it('P0 is strictly highest', () => {
    expect(meetsSeverityThreshold('P1', 'P0')).toBe(false);
    expect(meetsSeverityThreshold('P0', 'P0')).toBe(true);
  });
});

describe('formatAlertMessage — no secrets leak', () => {
  const alert: AlertInput = {
    severity: 'P0',
    ruleId: 'solvency_breach',
    title: 'Solvency ratio below minimum',
    detail: { ratio: 0.5, minRatio: 1, liabilityUsdt: 1000 },
    entityType: 'solvency',
    entityId: 'main',
    autoPaused: true,
  };

  it('includes the human-facing fields', () => {
    const msg = formatAlertMessage(alert);
    expect(msg).toContain('[P0]');
    expect(msg).toContain('Solvency ratio below minimum');
    expect(msg).toContain('solvency_breach');
    expect(msg).toContain('auto-paused');
  });

  it('contains no secret-shaped fields', () => {
    const msg = formatAlertMessage(alert).toLowerCase();
    for (const forbidden of ['token', 'secret', 'password', 'jwt', 'bearer', 'private_key', 'privatekey', 'webhook', 'bot', 'api_key', 'apikey', 'service_role']) {
      expect(msg).not.toContain(forbidden);
    }
  });
});

describe('notify — threshold + fail-soft', () => {
  const orig = { ...process.env };
  beforeEach(() => {
    delete process.env.SECURITY_TELEGRAM_BOT_TOKEN;
    delete process.env.SECURITY_TELEGRAM_CHAT_ID;
    delete process.env.SECURITY_SLACK_WEBHOOK_URL;
    delete process.env.SECURITY_ALERT_MIN_SEVERITY;
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  const p1Alert: AlertInput = { severity: 'P1', ruleId: 'r', title: 't' };
  const p3Alert: AlertInput = { severity: 'P3', ruleId: 'r', title: 't' };

  function fakeDeps() {
    const calls: string[] = [];
    const deps: NotifyDeps = {
      fetchImpl: (async (url: string) => { calls.push(String(url)); return { ok: true } as Response; }) as typeof fetch,
      log: () => {},
    };
    return { deps, calls };
  }

  it('below min severity → no push', async () => {
    process.env.SECURITY_ALERT_MIN_SEVERITY = 'P1';
    process.env.SECURITY_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/x';
    const { deps, calls } = fakeDeps();
    const res = await notify(p3Alert, deps);
    expect(res.sent).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('no channel configured → no-op, no throw', async () => {
    const { deps, calls } = fakeDeps();
    const res = await notify(p1Alert, deps);
    expect(res.sent).toBe(false);
    expect(res.skipped).toBe('no-channel-configured');
    expect(calls).toHaveLength(0);
  });

  it('slack configured + severity meets → push', async () => {
    process.env.SECURITY_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/x';
    const { deps, calls } = fakeDeps();
    const res = await notify(p1Alert, deps);
    expect(res.sent).toBe(true);
    expect(res.channels).toContain('slack');
    expect(calls).toHaveLength(1);
  });

  it('telegram configured → push to Bot API', async () => {
    process.env.SECURITY_TELEGRAM_BOT_TOKEN = 'abc';
    process.env.SECURITY_TELEGRAM_CHAT_ID = '123';
    const { deps, calls } = fakeDeps();
    const res = await notify(p1Alert, deps);
    expect(res.channels).toContain('telegram');
    expect(calls[0]).toContain('api.telegram.org');
  });

  it('fail-soft: fetch throwing does not throw out of notify', async () => {
    process.env.SECURITY_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/x';
    const deps: NotifyDeps = {
      fetchImpl: (async () => { throw new Error('network down'); }) as typeof fetch,
      log: () => {},
    };
    const res = await notify(p1Alert, deps);
    expect(res.sent).toBe(false); // no channel succeeded
  });
});
