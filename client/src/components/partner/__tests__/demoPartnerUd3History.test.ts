import { describe, expect, it } from 'vitest';
import { DEMO_PARTNER_STATE } from '../partnerData';

describe('DEMO_PARTNER_STATE UD3 history', () => {
  it('uses engine-built differential history (no bulk 1800×60%)', () => {
    const rows = DEMO_PARTNER_STATE.ud3SettlementHistory;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.role === 'upline' && r.sourceDepth === 2)).toBe(true);
    expect(rows.some((r) => r.dailyNewPerformanceUsd === 1800 && r.ud3Amount === 540)).toBe(false);
    expect(DEMO_PARTNER_STATE.lifetimeUd3Earned).toBe(
      Math.round(rows.reduce((s, r) => s + r.ud3Amount, 0) * 100) / 100,
    );
  });
});
