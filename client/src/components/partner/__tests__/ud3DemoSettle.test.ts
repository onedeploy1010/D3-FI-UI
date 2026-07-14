import { describe, expect, it } from 'vitest';
import { partnerTeamNodes } from '../partnerTeamData';
import {
  applyPendingDepositsToDailyNew,
  buildDemoUd3PendingRows,
  buildDemoUd3SettlementHistory,
  DEMO_PENDING_DEPOSITS_SEED,
  DEMO_UD3_LAST_SETTLED,
  DEMO_UD3_TODAY,
  getDemoPendingDepositTotalUsd,
  sumDemoUd3History,
} from '../ud3DemoSettle';

describe('demo UD3 settled vs pending seeds', () => {
  const settled = buildDemoUd3SettlementHistory(partnerTeamNodes);
  const pending = buildDemoUd3PendingRows(partnerTeamNodes, DEMO_PENDING_DEPOSITS_SEED);

  it('history dates are all on/before last settled day', () => {
    expect(settled.every((r) => r.settledAt <= DEMO_UD3_LAST_SETTLED)).toBe(true);
    expect(settled.every((r) => r.settlementStatus === 'settled')).toBe(true);
  });

  it('seed pending is today downline new deposits', () => {
    expect(pending.every((r) => r.settledAt === DEMO_UD3_TODAY)).toBe(true);
    expect(pending.every((r) => r.settlementStatus === 'pending')).toBe(true);
  });

  it('dailyNew from seed pending totals', () => {
    const nodes = applyPendingDepositsToDailyNew(partnerTeamNodes, DEMO_PENDING_DEPOSITS_SEED);
    expect(nodes.me!.dailyNewUsd).toBe(getDemoPendingDepositTotalUsd());
  });

  it('settled lifetime > 0', () => {
    expect(sumDemoUd3History(settled)).toBeGreaterThan(0);
  });
});
