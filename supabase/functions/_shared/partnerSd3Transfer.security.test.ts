import { describe, it, expect, vi } from 'vitest';

vi.mock('./partnerPerformance.ts', () => ({
  isPartnerDownlineOf: async () => true,
}));
vi.mock('./audit.ts', () => ({ writeAuditLog: async () => {} }));

import { transferPartnerSd3 } from './partnerSd3Transfer.ts';

type Resp = {
  rpc?: Record<string, { data?: unknown; error?: unknown }>;
  sender?: unknown; // partner_accounts select w/ is_partner
  recipientProfile?: unknown; // profiles select
  recipientAcct?: unknown; // partner_accounts select 'wallet_address'
  recipientAfter?: unknown; // partner_accounts select 'ud3_balance'
  transferInsert?: { data?: unknown; error?: unknown };
};

function makeSb(responses: Resp) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const inserts: { table: string; payload: unknown }[] = [];
  function resolve(table: string, st: { op: string; cols: string; payload?: unknown }) {
    if (table === 'profiles') return { data: responses.recipientProfile ?? null, error: null };
    if (table === 'partner_accounts' && st.op === 'select') {
      if (st.cols.includes('is_partner')) return { data: responses.sender ?? null, error: null };
      if (st.cols === 'wallet_address') return { data: responses.recipientAcct ?? null, error: null };
      if (st.cols === 'ud3_balance') return { data: responses.recipientAfter ?? { ud3_balance: 90 }, error: null };
    }
    if (table === 'partner_ud3_transfers' && st.op === 'insert') {
      return responses.transferInsert ?? { data: { id: 't1' }, error: null };
    }
    return { data: null, error: null };
  }
  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve(responses.rpc?.[name] ?? { data: null, error: null });
    },
    from: (table: string) => {
      const st: { op: string; cols: string; payload?: unknown } = { op: 'select', cols: '' };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: (cols: string) => { st.cols = cols ?? ''; return b; },
        insert: (payload: unknown) => { st.op = 'insert'; st.payload = payload; inserts.push({ table, payload }); return b; },
        update: () => { st.op = 'update'; return b; },
        eq: () => b,
        in: () => b,
        ilike: () => b,
        maybeSingle: () => Promise.resolve(resolve(table, st)),
        single: () => Promise.resolve(resolve(table, st)),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve(table, st)).then(f, r),
      };
      return b;
    },
  };
  return { sb, rpcCalls, inserts };
}

const SENDER = { wallet_address: '0xfrom', is_partner: true, ud3_balance: 1000 };

describe('transferPartnerSd3 — V-06 atomic transfer_ud3', () => {
  it('transfer_ud3 rejects INSUFFICIENT_BALANCE -> 400', async () => {
    const { sb } = makeSb({
      sender: SENDER,
      recipientProfile: { wallet_address: '0xto' },
      recipientAcct: { wallet_address: '0xto' },
      rpc: { transfer_ud3: { error: { message: 'INSUFFICIENT_BALANCE' } } },
    });
    await expect(transferPartnerSd3(sb, '0xfrom', '0xto', 100)).rejects.toMatchObject({ status: 400 });
  });

  it('transfer_ud3 rejects RECIPIENT_NOT_FOUND -> 404', async () => {
    const { sb } = makeSb({
      sender: SENDER,
      recipientProfile: { wallet_address: '0xto' },
      recipientAcct: { wallet_address: '0xto' },
      rpc: { transfer_ud3: { error: { message: 'RECIPIENT_NOT_FOUND' } } },
    });
    await expect(transferPartnerSd3(sb, '0xfrom', '0xto', 100)).rejects.toMatchObject({ status: 404 });
  });

  it('success path performs atomic move then inserts transfer record', async () => {
    const { sb, rpcCalls, inserts } = makeSb({
      sender: SENDER,
      recipientProfile: { wallet_address: '0xTO' },
      recipientAcct: { wallet_address: '0xTO' },
      recipientAfter: { ud3_balance: 100 },
      rpc: { transfer_ud3: { data: 900, error: null } },
      transferInsert: { data: { id: 't42' }, error: null },
    });
    const res = await transferPartnerSd3(sb, '0xfrom', '0xTO', 100);
    expect(rpcCalls.map((c) => c.name)).toContain('transfer_ud3');
    expect(res.transferId).toBe('t42');
    expect(res.senderBalance).toBe(900);
    // transfer record inserted AFTER the balance move.
    expect(inserts.some((i) => i.table === 'partner_ud3_transfers')).toBe(true);
  });

  it('auto-provisions a missing recipient partner_accounts row before transfer', async () => {
    const { sb, inserts } = makeSb({
      sender: SENDER,
      recipientProfile: { wallet_address: '0xnew' },
      recipientAcct: null, // no partner_accounts row yet
      rpc: { transfer_ud3: { data: 900, error: null } },
      transferInsert: { data: { id: 't1' }, error: null },
    });
    await transferPartnerSd3(sb, '0xfrom', '0xnew', 100);
    expect(inserts.some((i) => i.table === 'partner_accounts')).toBe(true);
  });
});
