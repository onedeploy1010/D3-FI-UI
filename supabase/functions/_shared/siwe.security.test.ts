import { describe, it, expect } from 'vitest';

import { clientIpFromRequest, reapExpiredNonces } from './siwe.ts';

/**
 * R-5: the pre-auth SIWE handshake must stay bounded/throttled.
 *  (a) reapExpiredNonces deletes siwe_nonces filtered on `expires_at < now`.
 *  (b) clientIpFromRequest extracts the first x-forwarded-for hop for rate-limit keys.
 */

type DeleteCall = {
  table: string;
  deleted: boolean;
  filters: Array<{ op: string; col: string; val: unknown }>;
  selected?: string;
};

/** Inline fake sb capturing exactly the delete().lt().select() chain the reaper issues. */
function makeSb(rows: Array<{ nonce: string }>, cap: DeleteCall[]) {
  function builder(table: string) {
    const call: DeleteCall = { table, deleted: false, filters: [] };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      delete: () => {
        call.deleted = true;
        return b;
      },
      lt: (col: string, val: unknown) => {
        call.filters.push({ op: 'lt', col, val });
        return b;
      },
      select: (cols: string) => {
        call.selected = cols;
        cap.push(call);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return b;
  }
  // deno-lint-ignore no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

describe('reapExpiredNonces', () => {
  it('issues a delete on siwe_nonces filtered by expires_at < now, returns deleted count', async () => {
    const cap: DeleteCall[] = [];
    const sb = makeSb([{ nonce: 'a' }, { nonce: 'b' }], cap);

    const before = Date.now();
    const deleted = await reapExpiredNonces(sb);
    const after = Date.now();

    expect(deleted).toBe(2);
    expect(cap).toHaveLength(1);
    const call = cap[0];
    expect(call.table).toBe('siwe_nonces');
    expect(call.deleted).toBe(true);

    // The one filter is `expires_at < <cutoff>` and the cutoff is ~now.
    expect(call.filters).toHaveLength(1);
    const f = call.filters[0];
    expect(f.op).toBe('lt');
    expect(f.col).toBe('expires_at');
    const cutoffMs = new Date(String(f.val)).getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after + 1000);
  });

  it('widens the cutoff into the past when olderThanMs is given', async () => {
    const cap: DeleteCall[] = [];
    const sb = makeSb([], cap);
    const grace = 60_000;
    const before = Date.now();
    await reapExpiredNonces(sb, { olderThanMs: grace });
    const cutoffMs = new Date(String(cap[0].filters[0].val)).getTime();
    expect(cutoffMs).toBeLessThanOrEqual(before - grace + 1000);
  });

  it('fails soft (returns 0) when the driver returns an error', async () => {
    // deno-lint-ignore no-explicit-any
    const sb: any = {
      from: () => ({
        delete: () => ({
          lt: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
        }),
      }),
    };
    expect(await reapExpiredNonces(sb)).toBe(0);
  });
});

describe('clientIpFromRequest', () => {
  const reqWith = (headers: Record<string, string>) =>
    new Request('https://example.test/auth/nonce', { method: 'POST', headers });

  it('returns the FIRST hop of x-forwarded-for', () => {
    const req = reqWith({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
    expect(clientIpFromRequest(req)).toBe('203.0.113.7');
  });

  it('trims whitespace around the first hop', () => {
    const req = reqWith({ 'x-forwarded-for': '  198.51.100.9 , 10.0.0.1' });
    expect(clientIpFromRequest(req)).toBe('198.51.100.9');
  });

  it('falls back to x-real-ip then a constant', () => {
    expect(clientIpFromRequest(reqWith({ 'x-real-ip': '192.0.2.44' }))).toBe('192.0.2.44');
    expect(clientIpFromRequest(reqWith({}))).toBe('unknown');
  });
});
