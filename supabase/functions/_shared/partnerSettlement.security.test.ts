import { describe, it, expect } from 'vitest';
import { assertSettlementDateNotFuture } from './partnerSettlement.ts';

/**
 * V-11 regression: a caller-supplied settlement date must be valid YYYY-MM-DD and
 * must NOT be in the future relative to today in SGT. Settling a future day would
 * credit yield that has not yet accrued. `todaySgt` is injected so the test is
 * deterministic and independent of the real clock.
 */

const TODAY = '2026-07-16';

describe('assertSettlementDateNotFuture', () => {
  it('today -> ok', () => {
    expect(() => assertSettlementDateNotFuture(TODAY, TODAY)).not.toThrow();
  });

  it('past date -> ok', () => {
    expect(() => assertSettlementDateNotFuture('2026-07-15', TODAY)).not.toThrow();
    expect(() => assertSettlementDateNotFuture('2025-01-01', TODAY)).not.toThrow();
  });

  it('future date -> throws HttpError(400) "in the future"', () => {
    try {
      assertSettlementDateNotFuture('2026-07-17', TODAY);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(String(e.message)).toContain('future');
    }
  });

  it('malformed date -> throws HttpError(400)', () => {
    for (const bad of ['2026-7-16', '20260716', 'not-a-date', '', '2026/07/16']) {
      try {
        assertSettlementDateNotFuture(bad, TODAY);
        throw new Error(`expected throw for ${bad}`);
      } catch (e: any) {
        expect(e.status).toBe(400);
      }
    }
  });

  it('impossible calendar date passing the regex -> throws HttpError(400)', () => {
    try {
      assertSettlementDateNotFuture('2026-13-40', TODAY);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});
