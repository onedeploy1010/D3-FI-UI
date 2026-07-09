import type { UnionProfileBundle, DividendAccrual, FiPosition, PocScoreRow, PocScoreView } from './d3fiTypes';
import { shortWallet } from './wallet';

const D3_USD = 2;
const DT_USD = 30;

export type D3FiActivePosition = {
  type: string;
  amount: string;
  progress: number;
  remaining: string;
  apy: string;
};

export type D3FiActivity = {
  actionZh: string;
  actionEn: string;
  amount: string;
  time: string;
  positive: boolean;
};

export type D3FiBreakdownItem = {
  id: string;
  epoch: string;
  date: string;
  category: 'bribe' | 'lp' | 'emission' | 'dt';
  sourceZh: string;
  sourceEn: string;
  asset: 'USDT' | 'D3' | 'USD3';
  amount: number;
  status: 'claimable' | 'pending';
};

export type D3FiHistoryItem = {
  id: string;
  date: string;
  epoch: string;
  usdt: number;
};

export type D3FiReferralReward = {
  id: string;
  from: string;
  dusd: number;
  date: string;
};

export type D3FiTeamDynamicReward = {
  id: string;
  type: 'poc' | 'pon' | 'other';
  labelZh: string;
  labelEn: string;
  amount: number;
  asset: 'USDT' | 'D3';
  date: string;
  status: 'claimable' | 'pending' | 'claimed';
};

export type D3FiViewModel = {
  portfolioTotalUsd: number;
  claimableUsdt: number;
  claimableUsd3: number;
  veD3Weight: number;
  level: string;
  epoch: string;
  usd3: {
    total: number;
    available: number;
    staked: number;
    transferable: number;
    pending: number;
    selfPool: number;
    downlinePool: number;
  };
  d3: { amount: number; valueUsd: number; veLocked: number };
  dt: { amount: number; valueUsd: number };
  directCount: number;
  teamCount: number;
  cumulativeReferralUsd3: number;
  pendingReferral: { total: number; self: number; transferable: number; epoch: string };
  transferableQuota: { credited: number; used: number; remaining: number };
  positions: D3FiActivePosition[];
  recentActivity: D3FiActivity[];
  breakdownItems: D3FiBreakdownItem[];
  historyItems: D3FiHistoryItem[];
  referralRewards: D3FiReferralReward[];
  teamDynamicPending: { usdt: number; d3: number; epoch: string };
  teamDynamicHistory: D3FiTeamDynamicReward[];
  teamPerformance: {
    level: string;
    levelRange: string;
    directCount: number;
    teamCount: number;
    validCount: number;
    largeAreaUsd: number;
    smallAreaUsd: number;
  };
  directReferralAddresses: string[];
  poc: PocScoreView;
};

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

function timeAgo(iso: string, lang: 'zh' | 'en') {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (hours < 24) return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'zh' ? `${days} 天前` : `${days}d ago`;
}

function streamToCategory(stream: string): D3FiBreakdownItem['category'] {
  if (stream === 'fees') return 'lp';
  if (stream === 'treasury') return 'emission';
  if (stream === 'line') return 'bribe';
  return 'dt';
}

function assetLabel(assetType: string): D3FiBreakdownItem['asset'] {
  if (assetType === 'usd3') return 'USD3';
  if (assetType === 'd3') return 'D3';
  return 'USDT';
}

function mapDividend(d: DividendAccrual): D3FiBreakdownItem {
  return {
    id: d.id,
    epoch: d.period_label ?? '—',
    date: fmtDate(d.settled_at ?? d.created_at),
    category: streamToCategory(d.stream_id),
    sourceZh: d.source_zh ?? d.stream_id,
    sourceEn: d.source_en ?? d.stream_id,
    asset: assetLabel(d.asset_type),
    amount: num(d.amount),
    status: d.status === 'claimable' ? 'claimable' : 'pending',
  };
}

function mapPosition(p: FiPosition, lang: 'zh' | 'en'): D3FiActivePosition {
  const labels: Record<string, [string, string]> = {
    lp: ['USD3 → LP 债券', 'USD3 → LP Bond'],
    ve_lock: ['veD3 锁仓', 'veD3 Lock'],
    burn_bond: ['销毁债券', 'Burn Bond'],
    spot: ['现货', 'Spot'],
    governance: ['治理仓位', 'Governance'],
  };
  const [typeZh, typeEn] = labels[p.position_type] ?? [p.position_type, p.position_type];
  const amount =
    p.principal_usd3 != null
      ? `${num(p.principal_usd3).toLocaleString()} USD3`
      : p.principal_d3 != null
        ? `${num(p.principal_d3).toLocaleString()} D3`
        : p.principal_usdt != null
          ? `$${num(p.principal_usdt).toLocaleString()}`
          : '—';

  let progress = 0;
  let remaining = '—';
  if (p.locked_until && p.created_at) {
    const end = new Date(p.locked_until).getTime();
    const start = new Date(p.created_at).getTime();
    const now = Date.now();
    if (end > start) {
      progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    }
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    remaining = `${daysLeft}${lang === 'zh' ? '天' : 'd'}`;
  } else if (p.lock_days) {
    remaining = `${p.lock_days}${lang === 'zh' ? '天' : 'd'}`;
  }

  const apy = typeof p.metadata?.apy === 'string' ? p.metadata.apy : typeof p.metadata?.apy === 'number' ? `${p.metadata.apy}%` : '—';

  return {
    type: lang === 'zh' ? typeZh : typeEn,
    amount,
    progress,
    remaining,
    apy,
  };
}

function mapPocScore(row: PocScoreRow | null, fallbackLevel: string, fallbackEpoch: string): PocScoreView {
  const dims: Array<{ key: PocScoreView['dimensions'][number]['key']; weight: number; labelZh: string; labelEn: string; value: number; rawZh: string; rawEn: string }> = [
    { key: 'H', weight: 0.15, labelZh: '个人质押', labelEn: 'Personal Stake', value: num(row?.dim_h), rawZh: row?.raw_h_zh ?? '—', rawEn: row?.raw_h_en ?? '—' },
    { key: 'C', weight: 0.15, labelZh: '团队业绩', labelEn: 'Team Performance', value: num(row?.dim_c), rawZh: row?.raw_c_zh ?? '—', rawEn: row?.raw_c_en ?? '—' },
    { key: 'A', weight: 0.30, labelZh: '团队新增', labelEn: 'Team New Deposits', value: num(row?.dim_a), rawZh: row?.raw_a_zh ?? '—', rawEn: row?.raw_a_en ?? '—' },
    { key: 'R', weight: 0.30, labelZh: '留存率', labelEn: 'Retention', value: num(row?.dim_r), rawZh: row?.raw_r_zh ?? '—', rawEn: row?.raw_r_en ?? '—' },
    { key: 'E', weight: 0.10, labelZh: '有效账户', labelEn: 'Valid Accounts', value: num(row?.dim_e), rawZh: row?.raw_e_zh ?? '—', rawEn: row?.raw_e_en ?? '—' },
  ];

  const composite = num(row?.composite_score);
  const floor = num(row?.diff_floor_pct) || 16;
  const ceil = num(row?.diff_ceil_pct) || 38;
  const levelDiff =
    row?.level_diff_rate != null && num(row.level_diff_rate) > 0
      ? num(row.level_diff_rate)
      : Math.round((floor + (ceil - floor) * (composite / 100)) * 10) / 10;

  return {
    compositeScore: composite,
    levelDiffRate: levelDiff,
    levelLabel: row?.level_label ?? fallbackLevel,
    epochLabel: row?.epoch_label ?? fallbackEpoch,
    diffFloorPct: floor,
    diffCeilPct: ceil,
    dimensions: dims,
    settledAt: row?.settled_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

function isTeamDynamicDividend(d: DividendAccrual): boolean {
  if (d.asset_type === 'usd3') return false;
  const src = `${d.source_zh ?? ''}${d.source_en ?? ''}`.toLowerCase();
  return (
    src.includes('poc') ||
    src.includes('pon') ||
    src.includes('级差') ||
    src.includes('算力') ||
    src.includes('dynamic') ||
    src.includes('diff')
  );
}

function dynamicRewardType(d: DividendAccrual): D3FiTeamDynamicReward['type'] {
  const src = `${d.source_zh ?? ''}${d.source_en ?? ''}`.toLowerCase();
  if (src.includes('pon') || src.includes('算力')) return 'pon';
  if (src.includes('poc') || src.includes('级差')) return 'poc';
  return 'other';
}

export function buildD3FiViewModel(bundle: UnionProfileBundle, lang: 'zh' | 'en' = 'zh'): D3FiViewModel {
  const usd3 = bundle.usd3Account;
  const d3 = bundle.d3Account;
  const sh = bundle.shareholder;
  const team = bundle.teamNode;

  const available = num(usd3?.available);
  const staked = num(usd3?.moved_to_fi);
  const pending = num(usd3?.pending_usd3);
  const balance = num(usd3?.balance);
  const totalUsd3 = balance > 0 ? balance : available + staked + pending;
  const transferable = num(usd3?.downline_pool_remaining);
  const selfPool = num(usd3?.self_pool_remaining);

  const veLocked = bundle.fiPositions
    .filter((p) => p.position_type === 've_lock')
    .reduce((s, p) => s + num(p.principal_d3), 0);

  const d3Amount = num(d3?.pending_d3) + num(d3?.claimed_lifetime_d3) + veLocked;
  const dtAmount = num(sh?.genesis_dt_count);

  const portfolioTotalUsd =
    totalUsd3 + d3Amount * D3_USD + dtAmount * DT_USD + bundle.fiPositions.reduce((s, p) => s + num(p.principal_usdt), 0);

  const breakdownItems = bundle.dividends.map(mapDividend);
  const claimableUsdt = bundle.dividends
    .filter((d) => d.status === 'claimable' && d.asset_type === 'd3')
    .reduce((s, d) => s + num(d.amount), 0);
  const claimableUsd3 = pending;

  const latestEpoch =
    bundle.dividends.find((d) => d.period_label)?.period_label ??
    (bundle.dividends[0]?.created_at ? `#${new Date(bundle.dividends[0].created_at).getMonth() + 1}` : '—');

  const level = team?.level_label ?? sh?.level_label ?? 'V0';
  const directCount = team?.direct_count ?? bundle.directReferrals.length;
  const teamCount = team?.team_count ?? directCount;

  const cumulativeReferralUsd3 = num(usd3?.claimed_lifetime_usd3);

  const pendingReferral = {
    total: pending,
    self: Math.round(pending * 0.5 * 10) / 10,
    transferable: Math.round(pending * 0.5 * 10) / 10,
    epoch: latestEpoch,
  };

  const transferred = num(usd3?.transferred_to_downline);
  const downlineQuota = num(usd3?.downline_quota);

  const referralRewards: D3FiReferralReward[] =
    bundle.directReferrals.length > 0
      ? bundle.directReferrals.slice(0, 10).map((r) => ({
          id: r.wallet_address,
          from: shortWallet(r.wallet_address),
          dusd: 0,
          date: fmtDate(r.referred_at),
        }))
      : bundle.dividends
          .filter((d) => d.asset_type === 'usd3')
          .slice(0, 10)
          .map((d) => ({
            id: d.id,
            from: d.source_zh ?? d.source_en ?? '—',
            dusd: num(d.amount),
            date: fmtDate(d.created_at),
          }));

  const historyItems: D3FiHistoryItem[] = bundle.dividends
    .filter((d) => d.status === 'claimed')
    .slice(0, 20)
    .map((d) => ({
      id: d.id,
      date: fmtDate(d.claimed_at ?? d.created_at),
      epoch: d.period_label ?? '—',
      usdt: d.asset_type === 'd3' ? num(d.amount) : 0,
    }));

  const recentActivity: D3FiActivity[] = [
    ...bundle.dividends.slice(0, 3).map((d) => ({
      actionZh: d.status === 'claimed' ? '领取分红' : '分红入账',
      actionEn: d.status === 'claimed' ? 'Claimed dividend' : 'Dividend accrued',
      amount: `+${num(d.amount)} ${assetLabel(d.asset_type)}`,
      time: timeAgo(d.created_at, lang),
      positive: true,
    })),
    ...bundle.fiPositions.slice(0, 2).map((p) => ({
      actionZh: p.position_type === 'lp' ? 'LP 债券入场' : '开仓',
      actionEn: p.position_type === 'lp' ? 'LP Bond entry' : 'Position opened',
      amount: mapPosition(p, lang).amount,
      time: timeAgo(p.created_at, lang),
      positive: false,
    })),
  ].slice(0, 5);

  const dynamicDividends = bundle.dividends.filter(isTeamDynamicDividend);
  const teamDynamicPending = {
    usdt: dynamicDividends
      .filter((d) => d.status !== 'claimed' && d.asset_type !== 'd3')
      .reduce((s, d) => s + num(d.amount), 0),
    d3: dynamicDividends
      .filter((d) => d.status !== 'claimed' && d.asset_type === 'd3')
      .reduce((s, d) => s + num(d.amount), 0),
    epoch: latestEpoch,
  };
  const teamDynamicHistory: D3FiTeamDynamicReward[] = dynamicDividends.slice(0, 12).map((d) => ({
    id: d.id,
    type: dynamicRewardType(d),
    labelZh: d.source_zh ?? (dynamicRewardType(d) === 'pon' ? 'PoN 算力奖' : 'PoC 级差'),
    labelEn: d.source_en ?? (dynamicRewardType(d) === 'pon' ? 'PoN bonus' : 'PoC differential'),
    amount: num(d.amount),
    asset: d.asset_type === 'd3' ? 'D3' : 'USDT',
    date: fmtDate(d.settled_at ?? d.created_at),
    status: d.status === 'claimed' ? 'claimed' : d.status === 'claimable' ? 'claimable' : 'pending',
  }));

  const linePerf = num(sh?.line_performance_usd);
  const networkPerf = num(sh?.network_performance_usd);

  return {
    portfolioTotalUsd,
    claimableUsdt,
    claimableUsd3,
    veD3Weight: veLocked,
    level,
    epoch: latestEpoch,
    usd3: {
      total: totalUsd3,
      available,
      staked,
      transferable,
      pending,
      selfPool,
      downlinePool: transferable,
    },
    d3: { amount: d3Amount, valueUsd: d3Amount * D3_USD, veLocked },
    dt: { amount: dtAmount, valueUsd: dtAmount * DT_USD },
    directCount,
    teamCount,
    cumulativeReferralUsd3,
    pendingReferral,
    transferableQuota: {
      credited: downlineQuota,
      used: transferred,
      remaining: Math.max(0, downlineQuota - transferred),
    },
    positions: bundle.fiPositions.map((p) => mapPosition(p, lang)),
    recentActivity,
    breakdownItems,
    historyItems,
    referralRewards,
    teamDynamicPending,
    teamDynamicHistory,
    teamPerformance: {
      level,
      levelRange: level,
      directCount,
      teamCount,
      validCount: directCount,
      largeAreaUsd: linePerf,
      smallAreaUsd: networkPerf,
    },
    directReferralAddresses: bundle.directReferrals.map((r) => r.wallet_address),
    poc: mapPocScore(bundle.pocScore, level, latestEpoch),
  };
}

export function fmtUsd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(n: number, maxFrac = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}
