import { describe, expect, it, beforeEach } from 'vitest';
import {
  catchUpDemoSim,
  createBootstrapDemoSim,
  tickDemoSimOneDay,
  addSgtDays,
} from '../ud3DemoDailyTick';

describe('demo daily tick', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('bootstrap has settled ≤7/8 and pending on 7/9', () => {
    const s = createBootstrapDemoSim();
    expect(s.simToday).toBe('2026-07-09');
    expect(s.pendingDeposits.length).toBeGreaterThan(0);
    expect(s.settledHistory.every((r) => r.settledAt <= '2026-07-08')).toBe(true);
    expect(s.lifetimeUd3).toBeGreaterThan(0);
  });

  it('one tick settles prior pending and mints new members + deposits', () => {
    const before = createBootstrapDemoSim();
    const pendingUd3Before = before.pendingDeposits.length;
    const membersBefore = Object.keys(before.nodes).length;
    const nextDay = addSgtDays(before.lastTickDate, 1);
    const after = tickDemoSimOneDay(before, nextDay);

    expect(after.simToday).toBe(nextDay);
    expect(after.lastTickDate).toBe(nextDay);
    expect(Object.keys(after.nodes).length).toBe(membersBefore + 1);
    expect(after.pendingDeposits.length).toBeGreaterThan(0);
    expect(after.pendingDeposits.every((d) => d.settledAt === nextDay)).toBe(true);
    expect(after.settledHistory.length).toBeGreaterThanOrEqual(
      before.settledHistory.length + Math.min(1, pendingUd3Before),
    );
    expect(after.lifetimeUd3).toBeGreaterThanOrEqual(before.lifetimeUd3);
  });

  it('catch-up advances multiple days', () => {
    const base = createBootstrapDemoSim();
    const target = addSgtDays(base.lastTickDate, 3);
    const caught = catchUpDemoSim(base, target);
    expect(caught.lastTickDate).toBe(target);
    expect(Object.keys(caught.nodes).length).toBe(Object.keys(base.nodes).length + 3);
  });
});
