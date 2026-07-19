import { describe, it, expect, vi, afterEach } from 'vitest';

// Per-test override of a wallet's 小区业绩 (small-area). Empty → fall back to PERF.
// Only read inside the async mock below, which runs at test time (PERF is init'd).
const areaSmallOverride: Record<string, number> = {};

/**
 * UD3 V3 reward settlement (tier-coefficient × cumulative-difference) — fund-safety
 * regression.
 *
 * Real calculator + real config; only the DB (sb) and the perf rollup are mocked.
 * Scenario: 1000-USDT deposit, S1 引路人, up-chain S1→S6 above the referrer (all
 * reward-eligible partners).
 *   guide (引路人)   = 1000 × 0.6 × 1.00 = 600
 *   network slots S1..S6 = 1000 × 0.40 × coeff × incremental
 *                        = 80 / 88 / 72 / 78 / 84 / 90   (Σ = 492)
 *   each slot Sk is paid to the nearest ancestor with rank >= k → UP1..UP6 one each.
 *
 * Asserts:
 *  - GUIDE_REWARD + six NETWORK_DIFFERENCE_REWARD ledger rows with exact decimals,
 *    V3 tier metadata (reward_tier_code / tier_coefficient / incremental_rate), and
 *    the V3 algorithm + config version.
 *  - credit_pending_ud3 called once per RECEIVER with the fixed-6 decimal STRING
 *    amount (never a JS Number) — atomic RPC, no read-modify-write of the balance.
 *  - UNALLOCATED slots (no qualified/eligible ancestor) are recorded, never credited.
 *  - idempotency: a 23505 on a tier-slot insert skips that slot's credit.
 */

vi.mock('./partnerPerformance.ts', () => ({
  // Per-wallet team performance → 引路人 档位 (guide reward rate) still on total.
  sumReferralTreePerformance: async (_sb: unknown, wallet: string) =>
    PERF[String(wallet).toLowerCase()] ?? 0,
  // 网体 S-级别 now qualifies on 小区业绩 (small-area); this scenario mirrors the
  // total bands into small-area so each upline keeps its S1..S6 rank. A test may
  // override a single wallet's small-area (e.g. below the 1000U floor).
  fetchPartnerAreaStats: async (_sb: unknown, wallet: string) => {
    const w = String(wallet).toLowerCase();
    const small = w in areaSmallOverride ? areaSmallOverride[w] : (PERF[w] ?? 0);
    return { smallAreaUsd: small, smallAreaNewUsd: 0, largeAreaUsd: 0, largeAreaNewUsd: 0 };
  },
}));

afterEach(() => {
  for (const k of Object.keys(areaSmallOverride)) delete areaSmallOverride[k];
});

import { allocateUd3ForCreditedIntent } from './partnerUd3Settle.ts';
import { UD3_ALGO_VERSION_V3, UD3_REWARD_CONFIG_LATEST } from './ud3RewardConfig.ts';

// referrer S1 guide (perf ≤ 100k), uplines S1..S6 by total performance band.
const REFERRER = '0xREFERRER';
const UP = ['0xUP1', '0xUP2', '0xUP3', '0xUP4', '0xUP5', '0xUP6'];
const PERF: Record<string, number> = {
  [REFERRER.toLowerCase()]: 1_000, // S1 guide
  [UP[0].toLowerCase()]: 1_000, // S1  rank 1
  [UP[1].toLowerCase()]: 150_000, // S2  rank 2
  [UP[2].toLowerCase()]: 250_000, // S3  rank 3
  [UP[3].toLowerCase()]: 400_000, // S4  rank 4
  [UP[4].toLowerCase()]: 600_000, // S5  rank 5
  [UP[5].toLowerCase()]: 900_000, // S6  rank 6
};
// wallet_address (lower) → sponsor above it. referrer→up1→...→up6→(none).
const FULL_SPONSOR: Record<string, string> = {
  [REFERRER.toLowerCase()]: UP[0],
  [UP[0].toLowerCase()]: UP[1],
  [UP[1].toLowerCase()]: UP[2],
  [UP[2].toLowerCase()]: UP[3],
  [UP[3].toLowerCase()]: UP[4],
  [UP[4].toLowerCase()]: UP[5],
};

type Insert = { table: string; payload: Record<string, unknown> };

function makeSb(opts?: {
  sponsors?: Record<string, string>;
  /** Wallets (lowercased) that are reward-eligible partners. Defaults to ALL uplines. */
  eligible?: Set<string>;
  /** idempotency_key values whose ledger insert should return 23505. */
  duplicateKeys?: Set<string>;
}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const inserts: Insert[] = [];
  const updates: Insert[] = [];
  const upserts: Insert[] = [];
  const sponsors = opts?.sponsors ?? FULL_SPONSOR;
  const eligible = opts?.eligible ?? new Set(UP.map((w) => w.toLowerCase()));
  const dup = opts?.duplicateKeys ?? new Set<string>();

  // deno-lint-ignore no-explicit-any
  const sb: any = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      const st: { op: string; ilikeVal?: string; payload?: Record<string, unknown> } = { op: 'select' };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        insert: (p: Record<string, unknown>) => { st.op = 'insert'; st.payload = p; inserts.push({ table, payload: p }); return b; },
        update: (p: Record<string, unknown>) => { st.op = 'update'; updates.push({ table, payload: p }); return b; },
        upsert: (p: Record<string, unknown>) => { st.op = 'upsert'; upserts.push({ table, payload: p }); return b; },
        eq: () => b,
        ilike: (_col: string, val: string) => { st.ilikeVal = val; return b; },
        in: () => b,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(f, r),
      };
      function resolve() {
        if (table === 'partner_ud3_events' && st.op === 'select') return { data: null, error: null };
        if (table === 'partner_ud3_events' && st.op === 'insert') return { data: { id: 'ev1' }, error: null };
        if (table === 'referrals') {
          const sponsor = sponsors[String(st.ilikeVal ?? '').toLowerCase()];
          return { data: sponsor ? { sponsor_wallet_address: sponsor } : null, error: null };
        }
        if (table === 'partner_accounts' && st.op === 'select') {
          const isPartner = eligible.has(String(st.ilikeVal ?? '').toLowerCase());
          return { data: { is_partner: isPartner }, error: null };
        }
        if (table === 'partner_ud3_ledger' && st.op === 'insert') {
          const key = String((st.payload as Record<string, unknown>)?.idempotency_key ?? '');
          if (dup.has(key)) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }
      return b;
    },
  };
  return { sb, rpcCalls, inserts, updates, upserts };
}

const INPUT = {
  intentId: 'intent-1',
  depositorWallet: '0xDEPOSITOR',
  referrerWallet: REFERRER,
  depositUsdt: 1000,
  referrerTotalPerfUsdt: 1_000,
};

function ledgerRows(inserts: Insert[]) {
  return inserts.filter((i) => i.table === 'partner_ud3_ledger').map((i) => i.payload);
}

describe('allocateUd3ForCreditedIntent — V3 tier-difference reward settlement', () => {
  it('writes GUIDE_REWARD + six NETWORK tier rows with exact V3 decimals & metadata', async () => {
    const { sb, inserts } = makeSb();
    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const rows = ledgerRows(inserts);

    // ── 引路人 GUIDE_REWARD ─────────────────────────────────────────────────
    const guide = rows.find((r) => r.reward_type === 'GUIDE_REWARD')!;
    expect(guide).toBeTruthy();
    expect(guide.ud3_amount).toBe('600.000000');
    expect(guide.role).toBe('direct');
    expect(guide.beneficiary_level).toBe('S1');
    expect(guide.tier_coefficient).toBe('1.000000');
    expect(guide.guide_level_rate).toBe('1.000000');
    expect(guide.reward_status).toBe('CALCULATED');
    expect(guide.recipient_wallet).toBe(REFERRER);
    expect(guide.level_config_version).toBe(UD3_REWARD_CONFIG_LATEST);
    expect(guide.reward_algorithm_version).toBe(UD3_ALGO_VERSION_V3);

    // ── 网体 six tier slots S1..S6 ─────────────────────────────────────────
    const network = rows.filter((r) => r.reward_type === 'NETWORK_DIFFERENCE_REWARD');
    expect(network).toHaveLength(6);
    const byTier = [...network].sort((a, b) => Number(a.reward_tier_rank) - Number(b.reward_tier_rank));

    expect(byTier.map((r) => r.reward_tier_code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    // 1000 × 0.40 × coeff × incremental.
    expect(byTier.map((r) => r.ud3_amount)).toEqual([
      '80.000000', '88.000000', '72.000000', '78.000000', '84.000000', '90.000000',
    ]);
    expect(byTier.map((r) => r.tier_coefficient)).toEqual([
      '1.000000', '1.100000', '1.200000', '1.300000', '1.400000', '1.500000',
    ]);
    expect(byTier.map((r) => r.incremental_rate)).toEqual([
      '0.200000', '0.200000', '0.150000', '0.150000', '0.150000', '0.150000',
    ]);
    // Each slot matched to the nearest ancestor with rank >= slot rank → UP1..UP6.
    expect(byTier.map((r) => r.recipient_wallet)).toEqual(UP);
    expect(byTier.map((r) => r.receiver_tier_code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(byTier.every((r) => r.reward_status === 'CALCULATED')).toBe(true);
    expect(byTier.every((r) => r.unallocated_reason == null)).toBe(true);
    expect(byTier.every((r) => r.role === 'differential')).toBe(true);
    // Cumulative ladder is persisted for audit.
    expect(byTier[1].cumulative_rate).toBe('0.400000');
    expect(byTier[1].previous_released_rate).toBe('0.200000');

    // ── No BURN row in V3 (the tail is per-slot UNALLOCATED, not a lump BURN) ──
    expect(rows.find((r) => r.reward_type === 'BURN')).toBeUndefined();
  });

  it('credits each RECEIVER exactly once via the atomic RPC with decimal-STRING amounts', async () => {
    const { sb, rpcCalls, updates } = makeSb();
    await allocateUd3ForCreditedIntent(sb, INPUT);

    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    // 1 guide + 6 tier receivers.
    expect(credits).toHaveLength(7);

    const byWallet = new Map(credits.map((c) => [String(c.args.p_wallet).toLowerCase(), c.args.p_amount]));
    expect(byWallet.get(REFERRER.toLowerCase())).toBe('600.000000');
    expect(byWallet.get(UP[0].toLowerCase())).toBe('80.000000');
    expect(byWallet.get(UP[1].toLowerCase())).toBe('88.000000');
    expect(byWallet.get(UP[2].toLowerCase())).toBe('72.000000');
    expect(byWallet.get(UP[3].toLowerCase())).toBe('78.000000');
    expect(byWallet.get(UP[4].toLowerCase())).toBe('84.000000');
    expect(byWallet.get(UP[5].toLowerCase())).toBe('90.000000');

    // Every amount is a STRING (never a JS Number → no float drift).
    for (const c of credits) expect(typeof c.args.p_amount).toBe('string');

    // No read-modify-write of the balance/pending columns anywhere.
    for (const u of updates) {
      expect(Object.keys(u.payload)).not.toContain('ud3_balance');
      expect(Object.keys(u.payload)).not.toContain('pending_ud3');
    }

    // Immediate settlement runs once per receiver.
    expect(rpcCalls.filter((c) => c.name === 'settle_pending_ud3')).toHaveLength(7);
  });

  it('BURNS unmatched slots (no qualified ancestor) without crediting them', async () => {
    // Chain stops at UP3 (S1,S2,S3) → slots S4,S5,S6 have no rank-qualified ancestor.
    // Policy: 网体无合格上级 → 记录销毁 (reward_type=BURN, no credit).
    const shortSponsor: Record<string, string> = {
      [REFERRER.toLowerCase()]: UP[0],
      [UP[0].toLowerCase()]: UP[1],
      [UP[1].toLowerCase()]: UP[2],
    };
    const { sb, inserts, rpcCalls } = makeSb({
      sponsors: shortSponsor,
      eligible: new Set([UP[0], UP[1], UP[2]].map((w) => w.toLowerCase())),
    });
    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    // Tier-slot rows carry a reward_tier_code (guide row does not); calculated slots
    // are NETWORK_DIFFERENCE_REWARD, burned slots are BURN.
    const network = ledgerRows(inserts).filter((r) => r.reward_tier_code != null);
    const byTier = [...network].sort((a, b) => Number(a.reward_tier_rank) - Number(b.reward_tier_rank));

    // S1..S3 CALCULATED to UP1..UP3; S4..S6 BURNED to the sentinel sink.
    expect(byTier.map((r) => r.reward_status)).toEqual([
      'CALCULATED', 'CALCULATED', 'CALCULATED', 'UNALLOCATED', 'UNALLOCATED', 'UNALLOCATED',
    ]);
    expect(byTier.map((r) => r.reward_type)).toEqual([
      'NETWORK_DIFFERENCE_REWARD', 'NETWORK_DIFFERENCE_REWARD', 'NETWORK_DIFFERENCE_REWARD',
      'BURN', 'BURN', 'BURN',
    ]);
    const unalloc = byTier.filter((r) => r.reward_type === 'BURN');
    expect(unalloc.map((r) => r.recipient_wallet)).toEqual(['unallocated:ud3', 'unallocated:ud3', 'unallocated:ud3']);
    expect(unalloc.map((r) => r.ud3_amount)).toEqual(['78.000000', '84.000000', '90.000000']);
    expect(unalloc.every((r) => r.unallocated_reason === 'NO_QUALIFIED_ANCESTOR')).toBe(true);
    expect(unalloc.every((r) => r.role === 'reserve')).toBe(true);
    expect(unalloc.every((r) => r.receiver_tier_code == null)).toBe(true);

    // Only guide + the 3 allocated receivers are credited (unallocated slots never are).
    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    expect(credits).toHaveLength(4);
    const wallets = credits.map((c) => String(c.args.p_wallet).toLowerCase());
    expect(wallets).toContain(REFERRER.toLowerCase());
    expect(wallets).toContain(UP[0].toLowerCase());
    expect(wallets).toContain(UP[2].toLowerCase());
  });

  it('FLOOR: 总业绩 < 100 的上级不算 S1 — 其网体差额级联给下一合格上级,自己一分不得', async () => {
    // 网体 S1 按【总业绩 ≥ 100U】达标。UP1 总业绩 = 50 (< 100) → S0/rank 0,不合格。
    // S1 槽应落到下一个 rank≥1 的祖先(UP2),UP1 收不到任何网体差额。
    // (mock 里 largeArea=0,故 teamPerf=总业绩=smallAreaOverride。)
    areaSmallOverride[UP[0].toLowerCase()] = 50;
    const { sb, inserts, rpcCalls } = makeSb();
    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    // UP1 从未被入账。
    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    const wallets = credits.map((c) => String(c.args.p_wallet).toLowerCase());
    expect(wallets).not.toContain(UP[0].toLowerCase());

    // S1 槽(rank 1)改由最近的 rank≥1 祖先 UP2 承接;六槽仍全部 CALCULATED(UP2 吃 S1+S2)。
    const network = ledgerRows(inserts).filter((r) => r.reward_type === 'NETWORK_DIFFERENCE_REWARD');
    expect(network).toHaveLength(6);
    const s1 = network.find((r) => r.reward_tier_code === 'S1')!;
    expect(s1.recipient_wallet).toBe(UP[1]);
    const s2 = network.find((r) => r.reward_tier_code === 'S2')!;
    expect(s2.recipient_wallet).toBe(UP[1]);
    // No BURN — every slot still found a qualified ancestor.
    expect(ledgerRows(inserts).find((r) => r.reward_type === 'BURN')).toBeUndefined();
  });

  it('idempotency: a 23505 on a tier-slot insert skips that receiver (no double credit)', async () => {
    // Duplicate the S3 slot (replay of a prior run) → its receiver UP3 is skipped.
    const dupKey = `UD3_TIER_REWARD:${INPUT.intentId}:S3:${UD3_ALGO_VERSION_V3}`;
    const { sb, rpcCalls } = makeSb({ duplicateKeys: new Set([dupKey]) });

    const res = await allocateUd3ForCreditedIntent(sb, INPUT);
    expect(res.ok).toBe(true);

    const credits = rpcCalls.filter((c) => c.name === 'credit_pending_ud3');
    // 7 receivers minus the duplicated S3 slot = 6 credits.
    expect(credits).toHaveLength(6);
    const wallets = credits.map((c) => String(c.args.p_wallet).toLowerCase());
    expect(wallets).not.toContain(UP[2].toLowerCase());
    // Other receivers still credited.
    expect(wallets).toContain(REFERRER.toLowerCase());
    expect(wallets).toContain(UP[5].toLowerCase());
  });
});
