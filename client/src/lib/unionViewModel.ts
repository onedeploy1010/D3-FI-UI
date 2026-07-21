import type { UnionProfileBundle } from './d3fiTypes';
import {
  UNION_SELF_SHARE,
  UNION_TRANSFERABLE_SHARE,
  splitPerformanceUsd3,
  type UnionMember,
  type UnionTeamNode,
  type MultisigWallet,
  type MultisigProposal,
  type Usd3AccountView,
} from '@/components/union/unionData';
import { shortWallet } from './wallet';

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

function buildUsd3View(bundle: UnionProfileBundle): Usd3AccountView {
  const u = bundle.usd3Account;
  const pending = num(u?.pending_usd3);
  const claimedLifetime = num(u?.claimed_lifetime_usd3);
  const selfPoolRemaining = num(u?.self_pool_remaining);
  const downlinePoolRemaining = num(u?.downline_pool_remaining);
  const total = num(u?.balance) || selfPoolRemaining + downlinePoolRemaining;
  return {
    pending,
    claimedLifetime,
    total,
    available: num(u?.available) || total,
    selfPoolRemaining,
    downlinePoolRemaining,
    movedToFi: num(u?.moved_to_fi),
    transferredToDownline: num(u?.transferred_to_downline),
    extractableToFi: selfPoolRemaining,
    transferableLeft: downlinePoolRemaining,
    selfQuota: num(u?.self_quota),
    downlineQuota: num(u?.downline_quota),
  };
}

export function buildTeamNodes(wallet: string, bundle: UnionProfileBundle): Record<string, UnionTeamNode> {
  const rows = bundle.lineTeamNodes;
  if (rows.length === 0) {
    const sh = bundle.shareholder;
    const me: UnionTeamNode = {
      id: 'me',
      address: wallet,
      short: shortWallet(wallet),
      level: bundle.teamNode?.level_label ?? sh?.level_label ?? 'V0',
      personalUsd: num(bundle.teamNode?.personal_usd ?? sh?.line_performance_usd),
      teamUsd: num(bundle.teamNode?.team_usd ?? bundle.unionLine?.total_performance_usd),
      directCount: bundle.teamNode?.direct_count ?? bundle.directReferrals.length,
      teamCount: bundle.teamNode?.team_count ?? bundle.unionLine?.total_members ?? bundle.directReferrals.length,
      parentId: null,
      childrenIds: bundle.directReferrals.map((_, i) => `d-${i}`),
    };
    const map: Record<string, UnionTeamNode> = { me };
    bundle.directReferrals.forEach((r, i) => {
      map[`d-${i}`] = {
        id: `d-${i}`,
        address: r.wallet_address,
        short: shortWallet(r.wallet_address),
        level: 'V0',
        personalUsd: 0,
        teamUsd: 0,
        directCount: 0,
        teamCount: 0,
        parentId: 'me',
        childrenIds: [],
        isDirect: true,
      };
    });
    return map;
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const walletLower = wallet.toLowerCase();
  let meId = rows.find((r) => r.wallet_address.toLowerCase() === walletLower)?.id ?? rows[0]?.id;
  const map: Record<string, UnionTeamNode> = {};

  for (const row of rows) {
    const children = rows.filter((c) => c.parent_node_id === row.id).map((c) => c.id);
    const nodeKey = row.id === meId ? 'me' : row.id;
    map[nodeKey] = {
      id: nodeKey,
      address: row.wallet_address,
      short: shortWallet(row.wallet_address),
      level: row.level_label,
      personalUsd: num(row.personal_usd),
      teamUsd: num(row.team_usd),
      directCount: row.direct_count,
      teamCount: row.team_count,
      parentId: row.parent_node_id
        ? row.parent_node_id === meId
          ? 'me'
          : row.parent_node_id
        : null,
      childrenIds: children.map((cid) => (cid === meId ? 'me' : cid)),
      isDirect: row.is_direct,
    };
  }
  if (!map.me && meId && byId.has(meId)) {
    const row = byId.get(meId)!;
    map.me = {
      id: 'me',
      address: row.wallet_address,
      short: shortWallet(row.wallet_address),
      level: row.level_label,
      personalUsd: num(row.personal_usd),
      teamUsd: num(row.team_usd),
      directCount: row.direct_count,
      teamCount: row.team_count,
      parentId: row.parent_node_id,
      childrenIds: rows.filter((c) => c.parent_node_id === meId).map((c) => c.id),
      isDirect: row.is_direct,
    };
  }
  return map;
}

function mapMultisigWallet(
  row: UnionProfileBundle['multisigWallets'][0],
  members: UnionProfileBundle['committeeMembers'],
  wallet: string,
): MultisigWallet {
  const signers = members
    .filter((m) => m.multisig_wallet_id === row.id)
    .map((m) => ({
      id: m.signer_wallet.toLowerCase() === wallet.toLowerCase() ? 'me' : m.id,
      address: m.signer_wallet,
      short: shortWallet(m.signer_wallet),
      roleZh: m.role_zh ?? '',
      roleEn: m.role_en ?? '',
      isSelf: m.signer_wallet.toLowerCase() === wallet.toLowerCase(),
      dividendWeightPct: m.dividend_weight_pct != null ? num(m.dividend_weight_pct) : null,
    }));
  return {
    id: row.id,
    type: row.wallet_type,
    address: row.treasury_address,
    short: row.short_address ?? shortWallet(row.treasury_address),
    labelZh: row.label_zh ?? '',
    labelEn: row.label_en ?? '',
    threshold: row.threshold,
    totalSigners: row.total_signers,
    balanceUsd3: num(row.balance_usd3),
    balanceD3: num(row.balance_d3),
    signers,
  };
}

function mapProposals(bundle: UnionProfileBundle, wallet: string): MultisigProposal[] {
  const members = bundle.committeeMembers;
  return bundle.multisigProposals.map((p) => {
    const msWallet = bundle.multisigWallets.find((w) => w.id === p.multisig_wallet_id);
    const walletSigners = members.filter((m) => m.multisig_wallet_id === p.multisig_wallet_id);
    const sigs = bundle.multisigSignatures.filter((s) => s.proposal_id === p.id);
    return {
      id: p.id,
      walletType: p.wallet_type,
      titleZh: p.title_zh,
      titleEn: p.title_en,
      descZh: p.desc_zh ?? '',
      descEn: p.desc_en ?? '',
      periodZh: p.period_zh ?? '',
      periodEn: p.period_en ?? '',
      usd3Amount: num(p.usd3_amount),
      d3Amount: num(p.d3_amount),
      beneficiaryCount: p.beneficiary_count,
      proposerShort: p.proposer_wallet ? shortWallet(p.proposer_wallet) : '—',
      createdAt: fmtDate(p.created_at),
      expiresAt: p.expires_at ? fmtDate(p.expires_at) : '',
      status: p.status,
      signatures: walletSigners.map((s) => {
        const sig = sigs.find((x) => x.signer_wallet.toLowerCase() === s.signer_wallet.toLowerCase());
        return {
          signerId: s.signer_wallet.toLowerCase() === wallet.toLowerCase() ? 'me' : s.id,
          signedAt: sig?.signed_at ?? null,
        };
      }),
      executedAt: p.executed_at ?? undefined,
      txHash: p.tx_hash ?? undefined,
      onchainStatus: p.onchain_status ?? 'off',
    };
  });
}

export type UnionViewModel = {
  member: UnionMember;
  usd3State: Usd3AccountView;
  performanceDividend: {
    genesisDt: number;
    linePerformanceUsd: number;
    networkPerformanceUsd: number;
    performanceWeightPct: number;
    equitySharePct: number;
    currentEpoch: string;
    currentMonthZh: string;
    currentMonthEn: string;
    hasPerformance: boolean;
  };
  usd3PerformanceDividend: {
    pending: number;
    multisigPending: number;
    claimedLifetime: number;
    settlementZh: string;
    settlementEn: string;
    nextEpochSettlementZh: string;
    nextEpochSettlementEn: string;
    nextMonthlySettlementZh: string;
    nextMonthlySettlementEn: string;
    breakdown: { streamId: 'fees' | 'treasury' | 'line'; amount: number; multisigPending: number; cycleZh: string; cycleEn: string }[];
  };
  d3PerformanceDividend: {
    pending: number;
    multisigPending: number;
    claimedLifetime: number;
    settlementZh: string;
    settlementEn: string;
    nextMonthlySettlementZh: string;
    nextMonthlySettlementEn: string;
    nextEpochSettlementZh: string;
    nextEpochSettlementEn: string;
    breakdown: { streamId: 'fees' | 'treasury' | 'line'; amount: number; multisigPending: number; cycleZh: string; cycleEn: string }[];
  };
  recentUsd3Dividends: { id: string; period: string; date: string; amount: number; sourceZh: string; sourceEn: string; status: 'claimed' | 'claimable' | 'none' | 'pending' | 'multisig_pending' }[];
  recentD3Dividends: { id: string; period: string; date: string; amount: number; sourceZh: string; sourceEn: string; status: 'claimed' | 'claimable' | 'none' | 'pending' | 'multisig_pending' }[];
  teamNodes: Record<string, UnionTeamNode>;
  lineMultisigWallet: MultisigWallet | null;
  daoMultisigWallet: MultisigWallet | null;
  multisigProposals: MultisigProposal[];
  currentMultisigRole: { isLineLeader: boolean; isCommitteeMember: boolean; signerId: string };
};

export function buildUnionViewModel(bundle: UnionProfileBundle, wallet: string): UnionViewModel {
  const sh = bundle.shareholder;
  const d3 = bundle.d3Account;
  const usd3View = buildUsd3View(bundle);

  const usd3Divs = bundle.dividends.filter((d) => d.asset_type === 'usd3');
  const d3Divs = bundle.dividends.filter((d) => d.asset_type === 'd3');

  const breakdownUsd3 = (['fees', 'treasury', 'line'] as const).map((streamId) => ({
    streamId,
    amount: usd3Divs
      .filter((d) => d.stream_id === streamId && d.status !== 'claimed' && d.status !== 'multisig_pending')
      .reduce((s, d) => s + num(d.amount), 0),
    multisigPending: usd3Divs
      .filter((d) => d.stream_id === streamId && d.status === 'multisig_pending')
      .reduce((s, d) => s + num(d.amount), 0),
    cycleZh: usd3Divs.find((d) => d.stream_id === streamId)?.period_label ?? '—',
    cycleEn: usd3Divs.find((d) => d.stream_id === streamId)?.period_label ?? '—',
  }));

  const breakdownD3 = (['fees', 'treasury', 'line'] as const).map((streamId) => ({
    streamId,
    amount: d3Divs
      .filter((d) => d.stream_id === streamId && d.status !== 'claimed' && d.status !== 'multisig_pending')
      .reduce((s, d) => s + num(d.amount), 0),
    multisigPending: d3Divs
      .filter((d) => d.stream_id === streamId && d.status === 'multisig_pending')
      .reduce((s, d) => s + num(d.amount), 0),
    cycleZh: d3Divs.find((d) => d.stream_id === streamId)?.period_label ?? '—',
    cycleEn: d3Divs.find((d) => d.stream_id === streamId)?.period_label ?? '—',
  }));

  const multisigPendingUsd3 = usd3Divs
    .filter((d) => d.status === 'multisig_pending')
    .reduce((s, d) => s + num(d.amount), 0);
  const multisigPendingD3 = d3Divs
    .filter((d) => d.status === 'multisig_pending')
    .reduce((s, d) => s + num(d.amount), 0);

  const latestPeriod = bundle.dividends[0]?.period_label ?? '#—';
  const now = new Date();
  const monthZh = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const monthEn = now.toLocaleString('en', { month: 'short', year: 'numeric' });

  const lineMs = bundle.multisigWallets.find((w) => w.wallet_type === 'line');
  const daoMs = bundle.multisigWallets.find((w) => w.wallet_type === 'dao');

  const isLineLeader =
    bundle.committeeMembers.some(
      (m) => m.is_line_leader && m.signer_wallet.toLowerCase() === wallet.toLowerCase(),
    ) ||
    Boolean(
      bundle.unionLine?.line_leader_wallet &&
        bundle.unionLine.line_leader_wallet.toLowerCase() === wallet.toLowerCase(),
    );
  const isCommitteeMember = bundle.committeeMembers.some(
    (m) => m.signer_wallet.toLowerCase() === wallet.toLowerCase(),
  );

  return {
    member: {
      isShareholder: Boolean(sh?.is_shareholder && sh.status === 'active'),
      joinedAt: sh?.joined_at ? fmtDate(sh.joined_at) : null,
      genesisDt: sh?.genesis_dt_count ?? 0,
      wallet,
    },
    usd3State: usd3View,
    performanceDividend: {
      genesisDt: sh?.genesis_dt_count ?? 0,
      linePerformanceUsd: num(sh?.line_performance_usd),
      networkPerformanceUsd: num(sh?.network_performance_usd),
      performanceWeightPct: num(sh?.equity_share_pct),
      equitySharePct: num(sh?.equity_share_pct),
      currentEpoch: latestPeriod,
      currentMonthZh: monthZh,
      currentMonthEn: monthEn,
      hasPerformance: num(sh?.line_performance_usd) > 0,
    },
    usd3PerformanceDividend: {
      pending: usd3View.pending,
      multisigPending: multisigPendingUsd3,
      claimedLifetime: usd3View.claimedLifetime,
      settlementZh: 'UD3 资产 · 不可提现到钱包',
      settlementEn: 'UD3 balance · not withdrawable to wallet',
      nextEpochSettlementZh: `Epoch ${latestPeriod}`,
      nextEpochSettlementEn: `Epoch ${latestPeriod}`,
      nextMonthlySettlementZh: `${monthZh}（多签复核后发放）`,
      nextMonthlySettlementEn: `${monthEn} (after multisig review)`,
      breakdown: breakdownUsd3,
    },
    d3PerformanceDividend: {
      pending: num(d3?.pending_d3),
      multisigPending: multisigPendingD3,
      claimedLifetime: num(d3?.claimed_lifetime_d3),
      settlementZh: '链上转账 · 透明可查',
      settlementEn: 'On-chain transfer · transparent',
      nextMonthlySettlementZh: monthZh,
      nextMonthlySettlementEn: monthEn,
      nextEpochSettlementZh: `Epoch ${latestPeriod}`,
      nextEpochSettlementEn: `Epoch ${latestPeriod}`,
      breakdown: breakdownD3,
    },
    recentUsd3Dividends: usd3Divs.slice(0, 10).map((d) => ({
      id: d.id,
      period: d.period_label ?? '—',
      date: fmtDate(d.settled_at ?? d.created_at),
      amount: num(d.amount),
      sourceZh: d.source_zh ?? d.stream_id,
      sourceEn: d.source_en ?? d.stream_id,
      status:
        d.status === 'none'
          ? 'none'
          : d.status === 'claimed'
            ? 'claimed'
            : d.status === 'claimable'
              ? 'claimable'
              : d.status === 'multisig_pending'
                ? 'multisig_pending'
                : 'pending',
    })),
    recentD3Dividends: d3Divs.slice(0, 10).map((d) => ({
      id: d.id,
      period: d.period_label ?? '—',
      date: fmtDate(d.settled_at ?? d.created_at),
      amount: num(d.amount),
      sourceZh: d.source_zh ?? d.stream_id,
      sourceEn: d.source_en ?? d.stream_id,
      status:
        d.status === 'none'
          ? 'none'
          : d.status === 'claimed'
            ? 'claimed'
            : d.status === 'claimable'
              ? 'claimable'
              : d.status === 'multisig_pending'
                ? 'multisig_pending'
                : 'pending',
    })),
    teamNodes: buildTeamNodes(wallet, bundle),
    lineMultisigWallet: lineMs ? mapMultisigWallet(lineMs, bundle.committeeMembers, wallet) : null,
    daoMultisigWallet: daoMs ? mapMultisigWallet(daoMs, bundle.committeeMembers, wallet) : null,
    multisigProposals: mapProposals(bundle, wallet),
    currentMultisigRole: {
      isLineLeader,
      isCommitteeMember,
      signerId: isLineLeader || isCommitteeMember ? 'me' : '',
    },
  };
}

export { UNION_SELF_SHARE, UNION_TRANSFERABLE_SHARE, splitPerformanceUsd3 };

/** Placeholder view model when wallet is connected but Supabase profile is not loaded yet. */
export function buildEmptyUnionViewModel(wallet: string): UnionViewModel {
  const now = new Date();
  const monthZh = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const monthEn = now.toLocaleString('en', { month: 'short', year: 'numeric' });
  const emptyBreakdown = (['fees', 'treasury', 'line'] as const).map((streamId) => ({
    streamId,
    amount: 0,
    multisigPending: 0,
    cycleZh: '—',
    cycleEn: '—',
  }));

  return {
    member: { isShareholder: false, joinedAt: null, genesisDt: 0, wallet },
    usd3State: {
      pending: 0,
      claimedLifetime: 0,
      total: 0,
      available: 0,
      selfPoolRemaining: 0,
      downlinePoolRemaining: 0,
      movedToFi: 0,
      transferredToDownline: 0,
      extractableToFi: 0,
      transferableLeft: 0,
      selfQuota: 0,
      downlineQuota: 0,
    },
    performanceDividend: {
      genesisDt: 0,
      linePerformanceUsd: 0,
      networkPerformanceUsd: 0,
      performanceWeightPct: 0,
      equitySharePct: 0,
      currentEpoch: '—',
      currentMonthZh: monthZh,
      currentMonthEn: monthEn,
      hasPerformance: false,
    },
    usd3PerformanceDividend: {
      pending: 0,
      multisigPending: 0,
      claimedLifetime: 0,
      settlementZh: 'UD3 资产 · 不可提现到钱包',
      settlementEn: 'UD3 balance · not withdrawable to wallet',
      nextEpochSettlementZh: '—',
      nextEpochSettlementEn: '—',
      nextMonthlySettlementZh: `${monthZh}（多签复核后发放）`,
      nextMonthlySettlementEn: `${monthEn} (after multisig review)`,
      breakdown: emptyBreakdown,
    },
    d3PerformanceDividend: {
      pending: 0,
      multisigPending: 0,
      claimedLifetime: 0,
      settlementZh: '链上转账 · 透明可查',
      settlementEn: 'On-chain transfer · transparent',
      nextMonthlySettlementZh: monthZh,
      nextMonthlySettlementEn: monthEn,
      nextEpochSettlementZh: '—',
      nextEpochSettlementEn: '—',
      breakdown: emptyBreakdown,
    },
    recentUsd3Dividends: [],
    recentD3Dividends: [],
    teamNodes: {},
    lineMultisigWallet: null,
    daoMultisigWallet: null,
    multisigProposals: [],
    currentMultisigRole: { isLineLeader: false, isCommitteeMember: false, signerId: '' },
  };
}
