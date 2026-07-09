/** Bribee Alliance (受贿者联盟) — Ch8 shareholder + performance dividends */

export const UNION_JOIN_FEE_USDT = 5000;

/** Shareholder equity split — PPT Ch6 / Whitepaper Ch8 */
export const unionEquityStructure = [
  { key: 'team', pct: 35, zh: '初创核心团队', en: 'Core team', ruleZh: '锁仓 4 年线性释放', ruleEn: '4y linear vesting' },
  { key: 'contrib', pct: 10, zh: '业绩贡献者', en: 'Top contributors', ruleZh: '合伙人线业绩排名 4/3/2/1%', ruleEn: 'Line performance ranks' },
  { key: 'refer', pct: 5, zh: '推荐合伙人', en: 'Partner referral', ruleZh: '推荐新合伙人入线加权', ruleEn: 'New partner referral weight' },
  { key: 'perf', pct: 40, zh: '业绩加权（全员）', en: 'Performance pool', ruleZh: '按全网真实业绩比例动态分配', ruleEn: 'By network real performance' },
  { key: 'dao', pct: 10, zh: '协议 DAO 储备', en: 'Protocol DAO', ruleZh: '多签控制生态扩张', ruleEn: 'Multisig ecosystem reserve' },
] as const;

/** Three shareholder revenue streams — PPT Ch6 */
export const unionRevenueStreams = [
  {
    id: 'fees',
    zh: '手续费收入',
    en: 'Trading fees',
    sourceZh: '买入 3% + 卖出 3% 滑点，按权益比例分配',
    sourceEn: '3% buy + 3% sell slippage, by equity share',
    cycleZh: '每 Epoch（30 天）结算',
    cycleEn: 'Per Epoch (30 days)',
    usd3Zh: '结算为 USD3 资产',
    usd3En: 'Settled as USD3',
    d3Zh: '同期权益折算 D3 份额',
    d3En: 'D3 share by equity weight',
  },
  {
    id: 'treasury',
    zh: '市值管理收入',
    en: 'Treasury yield',
    sourceZh: '国库自营做市套利 + 贿赂佣金 10% 分配部分',
    sourceEn: 'Treasury MM arb + 10% bribe commission share',
    cycleZh: '每月多签分配',
    cycleEn: 'Monthly multisig',
    usd3Zh: '套利与佣金 · 结算为 USD3',
    usd3En: 'Arb & commission · settled as USD3',
    d3Zh: '排放层 / 国库 D3 结算',
    d3En: 'Emission / treasury D3 settlement',
  },
  {
    id: 'line',
    zh: '分线收益',
    en: 'Line revenue',
    sourceZh: '本线 Gauge 运营 + 贿赂抽成 + 本线手续费',
    sourceEn: 'Line Gauge ops + bribe cut + line fees',
    cycleZh: '每月线长多签发放',
    cycleEn: 'Monthly line-leader multisig',
    usd3Zh: '本线手续费与贿赂 · 结算为 USD3',
    usd3En: 'Line fees & bribe · settled as USD3',
    d3Zh: '本线排放引导 D3',
    d3En: 'Line-guided D3 emission',
  },
] as const;

/** PPT Ch6 — shared performance context */
export const performanceDividend = {
  genesisDt: 1,
  linePerformanceUsd: 286_400,
  networkPerformanceUsd: 12_800_000,
  performanceWeightPct: 2.24,
  equitySharePct: 2.24,
  currentEpoch: '—',
  currentMonthZh: '2026年7月',
  currentMonthEn: 'Jul 2026',
  hasPerformance: true,
};

/** USD3 业绩分红 — 协议内资产，可转 D3-Fi 或转伞下 */
export const usd3PerformanceDividend = {
  pending: 186.4,
  claimedLifetime: 1240,
  settlementZh: 'USD3 资产 · 不可提现到钱包',
  settlementEn: 'USD3 balance · not withdrawable to wallet',
  nextEpochSettlementZh: 'Epoch #43 · 2026-08-06',
  nextEpochSettlementEn: 'Epoch #43 · Aug 6, 2026',
  nextMonthlySettlementZh: '2026-08-01（多签复核后发放）',
  nextMonthlySettlementEn: 'Aug 1, 2026 (after multisig review)',
  breakdown: [
    { streamId: 'fees' as const, amount: 68.2, cycleZh: 'Epoch #42', cycleEn: 'Epoch #42' },
    { streamId: 'treasury' as const, amount: 42.6, cycleZh: '2026年7月', cycleEn: 'Jul 2026' },
    { streamId: 'line' as const, amount: 75.6, cycleZh: '2026年7月本线', cycleEn: 'Jul 2026 line' },
  ],
};

/** D3 业绩分红 — PPT：链上代币结算 */
export const d3PerformanceDividend = {
  pending: 12.8,
  claimedLifetime: 86.4,
  /** PPT：分红形式 D3 代币结算 */
  settlementZh: '链上转账 · 透明可查',
  settlementEn: 'On-chain transfer · transparent',
  nextMonthlySettlementZh: '2026-08-01',
  nextMonthlySettlementEn: 'Aug 1, 2026',
  nextEpochSettlementZh: 'Epoch #43 · 2026-08-06',
  nextEpochSettlementEn: 'Epoch #43 · Aug 6, 2026',
  breakdown: [
    { streamId: 'fees' as const, amount: 4.1, cycleZh: 'Epoch #42', cycleEn: 'Epoch #42' },
    { streamId: 'treasury' as const, amount: 3.2, cycleZh: '2026年7月', cycleEn: 'Jul 2026' },
    { streamId: 'line' as const, amount: 5.5, cycleZh: '2026年7月本线', cycleEn: 'Jul 2026 line' },
  ],
};

export const usd3DividendFormula = {
  zh: [
    '个人 USD3 = 本线权益占比 × 当期可分配业绩份额',
    '手续费：买入/卖出 3% 滑点，每 Epoch（30天）按权益比例结算为 USD3',
    '市值管理：国库套利 + 贿赂佣金 10% 部分，每月多签结算为 USD3',
    '分线：本线手续费 + 贿赂抽成，每月线长多签发放 USD3',
    'USD3 用途：转 D3-Fi 投资质押，或转给伞下线的 D3-Fi 账户',
    '原则：有业绩才有分红，无业绩不保底',
  ],
  en: [
    'Your USD3 = equity share × distributable performance pool',
    'Fees: 3% buy/sell slippage, settled per Epoch (30d) as USD3',
    'Treasury: MM arb + 10% bribe commission, monthly multisig as USD3',
    'Line: line fees + bribe cut, monthly line-leader multisig as USD3',
    'USD3 use: move to D3-Fi for staking, or transfer to downline D3-Fi',
    'Rule: performance required — no floor guarantee',
  ],
};

export const d3DividendFormula = {
  zh: [
    '个人 D3 = 本线权益占比 × 当期可分配 D3 排放/结算份额',
    '手续费通道：Epoch 同步折算的 D3 权益份额',
    '市值管理：排放层 / 国库 D3，每月多签分配',
    '分线：本线 Gauge 引导的 D3 排放，每月线长多签',
    'PPT：分红形式为 D3 代币链上结算，透明可查',
  ],
  en: [
    'Your D3 = equity share × distributable D3 emission/settlement',
    'Fees channel: D3 equity share synced per Epoch',
    'Treasury: emission/treasury D3, monthly multisig',
    'Line: line Gauge-guided D3, monthly line-leader multisig',
    'PPT: dividends settled as D3 on-chain, transparent',
  ],
};

export const recentUsd3Dividends = [
  { id: 'u1', period: 'Epoch #41', date: '2026-07-06', amount: 98.5, sourceZh: '手续费滑点', sourceEn: 'Trading slippage', status: 'claimed' as const },
  { id: 'u2', period: '2026年6月', date: '2026-07-01', amount: 43.7, sourceZh: '分线手续费 + 贿赂', sourceEn: 'Line fees + bribe', status: 'claimed' as const },
  { id: 'u3', period: '2026年5月', date: '2026-06-01', amount: 0, sourceZh: '本期无业绩 — 无保底', sourceEn: 'No performance — no floor', status: 'none' as const },
];

export const recentD3Dividends = [
  { id: 'd1', period: 'Epoch #42', date: '2026-07-07', amount: 9.6, sourceZh: '手续费权益 D3', sourceEn: 'Fee equity D3', status: 'claimable' as const },
  { id: 'd2', period: '2026年6月', date: '2026-07-01', amount: 7.2, sourceZh: '分线排放 D3', sourceEn: 'Line emission D3', status: 'claimed' as const },
  { id: 'd3', period: '2026年5月', date: '2026-06-01', amount: 0, sourceZh: '本期无业绩 — 无保底', sourceEn: 'No performance — no floor', status: 'none' as const },
];

/** Within performance USD3: 50% for self D3-Fi, 50% transferable to umbrella downline D3-Fi */
export const UNION_SELF_SHARE = 0.5;
export const UNION_TRANSFERABLE_SHARE = 0.5;

export function splitPerformanceUsd3(total: number) {
  const self = Math.round(total * UNION_SELF_SHARE * 10) / 10;
  const transferable = Math.round((total - self) * 10) / 10;
  return { total, self, transferable };
}

/** Already moved out of USD3 account from claimed dividends */
export const usd3AccountUsage = {
  movedToFi: 500,
  transferredToDownline: 420,
};

export type Usd3AccountView = {
  pending: number;
  claimedLifetime: number;
  total: number;
  available: number;
  selfPoolRemaining: number;
  downlinePoolRemaining: number;
  movedToFi: number;
  transferredToDownline: number;
  extractableToFi: number;
  transferableLeft: number;
  selfQuota: number;
  downlineQuota: number;
};

/** Single source of truth: pending dividend + claimed account pools */
export function buildUsd3AccountView(pending = usd3PerformanceDividend.pending): Usd3AccountView {
  const claimedLifetime = usd3PerformanceDividend.claimedLifetime;
  const split = splitPerformanceUsd3(claimedLifetime);
  const selfPoolRemaining = Math.round((split.self - usd3AccountUsage.movedToFi) * 10) / 10;
  const downlinePoolRemaining = Math.round((split.transferable - usd3AccountUsage.transferredToDownline) * 10) / 10;
  const total = Math.round((selfPoolRemaining + downlinePoolRemaining) * 10) / 10;
  return {
    pending,
    claimedLifetime,
    total,
    available: total,
    selfPoolRemaining,
    downlinePoolRemaining,
    movedToFi: usd3AccountUsage.movedToFi,
    transferredToDownline: usd3AccountUsage.transferredToDownline,
    extractableToFi: selfPoolRemaining,
    transferableLeft: downlinePoolRemaining,
    selfQuota: split.self,
    downlineQuota: split.transferable,
  };
}

export function claimUsd3Pending(view: Usd3AccountView): Usd3AccountView {
  if (view.pending <= 0) return view;
  const split = splitPerformanceUsd3(view.pending);
  const pending = view.pending;
  return {
    ...view,
    pending: 0,
    claimedLifetime: Math.round((view.claimedLifetime + pending) * 10) / 10,
    total: Math.round((view.total + pending) * 10) / 10,
    available: Math.round((view.available + pending) * 10) / 10,
    selfPoolRemaining: Math.round((view.selfPoolRemaining + split.self) * 10) / 10,
    downlinePoolRemaining: Math.round((view.downlinePoolRemaining + split.transferable) * 10) / 10,
    extractableToFi: Math.round((view.selfPoolRemaining + split.self) * 10) / 10,
    transferableLeft: Math.round((view.downlinePoolRemaining + split.transferable) * 10) / 10,
    selfQuota: Math.round((view.selfQuota + split.self) * 10) / 10,
    downlineQuota: Math.round((view.downlineQuota + split.transferable) * 10) / 10,
  };
}

/** @deprecated use buildUsd3AccountView — kept for grep compatibility */
export const usd3Account = buildUsd3AccountView();

export const unionRuleCards = [
  {
    id: 'qualify',
    titleZh: '股东资格',
    titleEn: 'Qualification',
    bodyZh: '支付 5,000 USDT 认购创世 DT，成为发起人股东，解锁资产与团队。',
    bodyEn: 'Pay 5,000 USDT for Genesis DT to become a founding shareholder and unlock Assets & Team.',
    tagZh: '入盟门槛',
    tagEn: 'Entry',
    accent: '#E0568F',
  },
  {
    id: 'channels',
    titleZh: '业绩分红',
    titleEn: 'Performance dividends',
    bodyZh: 'USD3 协议内资产 + D3 链上代币，两条独立结算通道，分别入账。',
    bodyEn: 'USD3 in-app asset and D3 on-chain token — two separate settlement channels.',
    tagZh: '双通道',
    tagEn: 'Dual channel',
    accent: '#6366f1',
  },
  {
    id: 'usd3-source',
    titleZh: 'USD3 来源',
    titleEn: 'USD3 sources',
    bodyZh: '手续费滑点（每 Epoch 30 天）+ 市值管理 + 分线收益，统一结算为 USD3 协议资产。',
    bodyEn: 'Trading fees (per 30-day Epoch) + treasury yield + line revenue — settled as USD3.',
    tagZh: '协议内',
    tagEn: 'In-app',
    accent: '#22c55e',
  },
  {
    id: 'usd3-use',
    titleZh: 'USD3 用途',
    titleEn: 'USD3 usage',
    bodyZh: '50% 转入 D3-Fi 投资质押，50% 可转给伞下线的 D3-Fi 账户；不可提现到钱包。',
    bodyEn: '50% to D3-Fi staking, 50% transferable to downline D3-Fi — not withdrawable to wallet.',
    tagZh: '50 / 50',
    tagEn: '50 / 50',
    accent: '#f59e0b',
  },
  {
    id: 'd3',
    titleZh: 'D3 分红',
    titleEn: 'D3 dividends',
    bodyZh: '按权益占比折算的代币分红，链上透明结算，每月由多签 / 线长复核发放。',
    bodyEn: 'Equity-weighted token dividends — on-chain, distributed monthly via multisig.',
    tagZh: '链上',
    tagEn: 'On-chain',
    accent: '#B23A6E',
  },
  {
    id: 'principle',
    titleZh: '分红原则',
    titleEn: 'Core rule',
    bodyZh: '有业绩才有分红，无业绩不保底。所有分配与全网真实业绩挂钩。',
    bodyEn: 'Performance required — no floor guarantee. All payouts tied to real network results.',
    tagZh: '底线',
    tagEn: 'No floor',
    accent: '#8A2B57',
  },
] as const;

/** @deprecated use unionRuleCards */
export const unionRewardQualification = {
  zh: unionRuleCards.map((c) => `${c.titleZh}：${c.bodyZh}`),
  en: unionRuleCards.map((c) => `${c.titleEn}: ${c.bodyEn}`),
};

export type UnionMember = {
  isShareholder: boolean;
  joinedAt: string | null;
  genesisDt: number;
  wallet: string;
};

/** Demo: start locked; Join unlocks for the session */
export const defaultUnionMember: UnionMember = {
  isShareholder: false,
  joinedAt: null,
  genesisDt: 0,
  wallet: '0x1234567890abcdef1234567890abcdef12345678',
};

export type UnionTeamNode = {
  id: string;
  address: string;
  short: string;
  level: string;
  personalUsd: number;
  teamUsd: number;
  directCount: number;
  teamCount: number;
  parentId: string | null;
  childrenIds: string[];
  isDirect?: boolean;
};

/** Flat map for up/down navigation + search */
export const unionTeamNodes: Record<string, UnionTeamNode> = {
  me: {
    id: 'me',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    short: '0x1234…5678',
    level: '发起人',
    personalUsd: 5000,
    teamUsd: 286400,
    directCount: 3,
    teamCount: 48,
    parentId: null,
    childrenIds: ['a1', 'a2', 'a3'],
  },
  a1: {
    id: 'a1',
    address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf01',
    short: '0xAbCd…Ef01',
    level: 'V3',
    personalUsd: 12000,
    teamUsd: 98000,
    directCount: 2,
    teamCount: 18,
    parentId: 'me',
    childrenIds: ['b1', 'b2'],
    isDirect: true,
  },
  a2: {
    id: 'a2',
    address: '0x9876543210FeDcBa9876543210FeDcBa98765432',
    short: '0x9876…5432',
    level: 'V2',
    personalUsd: 8000,
    teamUsd: 72000,
    directCount: 2,
    teamCount: 14,
    parentId: 'me',
    childrenIds: ['b3', 'b4'],
    isDirect: true,
  },
  a3: {
    id: 'a3',
    address: '0x1111222233334444555566667777888899990000',
    short: '0x1111…0000',
    level: 'V1',
    personalUsd: 5000,
    teamUsd: 41400,
    directCount: 1,
    teamCount: 12,
    parentId: 'me',
    childrenIds: ['b5'],
    isDirect: true,
  },
  b1: {
    id: 'b1',
    address: '0xAAaaBBbbCCccDDddEEeeFFff0011223344556677',
    short: '0xAAaa…6677',
    level: 'V2',
    personalUsd: 6000,
    teamUsd: 42000,
    directCount: 2,
    teamCount: 8,
    parentId: 'a1',
    childrenIds: ['c1', 'c2'],
  },
  b2: {
    id: 'b2',
    address: '0xBb11223344556677889900AaBbCcDdEeFf001122',
    short: '0xBb11…1122',
    level: 'V1',
    personalUsd: 3500,
    teamUsd: 18000,
    directCount: 1,
    teamCount: 5,
    parentId: 'a1',
    childrenIds: ['c3'],
  },
  b3: {
    id: 'b3',
    address: '0xCc99887766554433221100FfEeDdCcBbAa009988',
    short: '0xCc99…9988',
    level: 'V1',
    personalUsd: 4200,
    teamUsd: 28000,
    directCount: 1,
    teamCount: 6,
    parentId: 'a2',
    childrenIds: ['c4'],
  },
  b4: {
    id: 'b4',
    address: '0xDd0102030405060708090a0b0c0d0e0f10111213',
    short: '0xDd01…1213',
    level: 'V0',
    personalUsd: 2100,
    teamUsd: 9600,
    directCount: 0,
    teamCount: 3,
    parentId: 'a2',
    childrenIds: [],
  },
  b5: {
    id: 'b5',
    address: '0xEeFFaa00112233445566778899aabbccddeeff00',
    short: '0xEeFF…ff00',
    level: 'V1',
    personalUsd: 2800,
    teamUsd: 22000,
    directCount: 1,
    teamCount: 7,
    parentId: 'a3',
    childrenIds: ['c5'],
  },
  c1: {
    id: 'c1',
    address: '0xF10102030405060708090a0b0c0d0e0f11121314',
    short: '0xF101…1314',
    level: 'V0',
    personalUsd: 1500,
    teamUsd: 4500,
    directCount: 0,
    teamCount: 2,
    parentId: 'b1',
    childrenIds: [],
  },
  c2: {
    id: 'c2',
    address: '0xF202030405060708090a0b0c0d0e0f1011121315',
    short: '0xF202…1315',
    level: 'V1',
    personalUsd: 3200,
    teamUsd: 12000,
    directCount: 0,
    teamCount: 3,
    parentId: 'b1',
    childrenIds: [],
  },
  c3: {
    id: 'c3',
    address: '0xF3030405060708090a0b0c0d0e0f101112131415',
    short: '0xF303…1415',
    level: 'V0',
    personalUsd: 1000,
    teamUsd: 1000,
    directCount: 0,
    teamCount: 1,
    parentId: 'b2',
    childrenIds: [],
  },
  c4: {
    id: 'c4',
    address: '0xF40405060708090a0b0c0d0e0f10111213141516',
    short: '0xF404…1516',
    level: 'V0',
    personalUsd: 2200,
    teamUsd: 8000,
    directCount: 0,
    teamCount: 2,
    parentId: 'b3',
    childrenIds: [],
  },
  c5: {
    id: 'c5',
    address: '0xF505060708090a0b0c0d0e0f1011121314151617',
    short: '0xF505…1617',
    level: 'V0',
    personalUsd: 1800,
    teamUsd: 6400,
    directCount: 0,
    teamCount: 2,
    parentId: 'b5',
    childrenIds: [],
  },
};

/** Privy Key Quorum — line treasury & protocol DAO multisig (demo) */
export type MultisigWalletType = 'line' | 'dao';

export type MultisigSigner = {
  id: string;
  address: string;
  short: string;
  roleZh: string;
  roleEn: string;
  isSelf?: boolean;
  dividendWeightPct?: number | null;
};

export type MultisigProposalStatus = 'pending' | 'executed' | 'rejected';

export type MultisigProposal = {
  id: string;
  walletType: MultisigWalletType;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  periodZh: string;
  periodEn: string;
  usd3Amount: number;
  d3Amount: number;
  beneficiaryCount: number;
  proposerShort: string;
  createdAt: string;
  expiresAt: string;
  status: MultisigProposalStatus;
  signatures: { signerId: string; signedAt: string | null }[];
  executedAt?: string;
  txHash?: string;
  onchainStatus?: 'off' | 'awaiting_signatures' | 'submitted' | 'confirmed' | 'failed';
};

export type MultisigWallet = {
  id: string;
  type: MultisigWalletType;
  address: string;
  short: string;
  labelZh: string;
  labelEn: string;
  threshold: number;
  totalSigners: number;
  balanceUsd3: number;
  balanceD3: number;
  signers: MultisigSigner[];
};

export const currentMultisigRole = {
  isLineLeader: true,
  isCommitteeMember: true,
  signerId: 'me',
};

export const lineMultisigWallet: MultisigWallet = {
  id: 'line-treasury',
  type: 'line',
  address: '0x7a3f8c2e1b9d4a6f0e5c8b2d1a9f7e4c3b6d8a1f',
  short: '0x7a3f…a1f',
  labelZh: '本线收益金库',
  labelEn: 'Line treasury',
  threshold: 2,
  totalSigners: 3,
  balanceUsd3: 4280,
  balanceD3: 186.4,
  signers: [
    { id: 'me', address: '0x1234567890abcdef1234567890abcdef12345678', short: '0x1234…5678', roleZh: '线长（你）', roleEn: 'Line leader (you)', isSelf: true },
    { id: 's2', address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf01', short: '0xAbCd…Ef01', roleZh: '委员 A', roleEn: 'Committee A' },
    { id: 's3', address: '0x9876543210FeDcBa9876543210FeDcBa98765432', short: '0x9876…5432', roleZh: '委员 B', roleEn: 'Committee B' },
  ],
};

export const daoMultisigWallet: MultisigWallet = {
  id: 'dao-reserve',
  type: 'dao',
  address: '0x9e2d1c0b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d',
  short: '0x9e2d…e3d',
  labelZh: '协议 DAO 储备',
  labelEn: 'Protocol DAO reserve',
  threshold: 3,
  totalSigners: 5,
  balanceUsd3: 128_400,
  balanceD3: 4200,
  signers: [
    { id: 'd1', address: '0xAAaaBBbbCCccDDddEEeeFFff0011223344556677', short: '0xAAaa…6677', roleZh: '核心委员', roleEn: 'Core committee' },
    { id: 'd2', address: '0xBb11223344556677889900AaBbCcDdEeFf001122', short: '0xBb11…1122', roleZh: '生态委员', roleEn: 'Ecosystem' },
    { id: 'd3', address: '0xCc99887766554433221100FfEeDdCcBbAa009988', short: '0xCc99…9988', roleZh: '风控委员', roleEn: 'Risk' },
    { id: 'd4', address: '0xDd0102030405060708090a0b0c0d0e0f10111213', short: '0xDd01…1213', roleZh: '运营委员', roleEn: 'Ops' },
    { id: 'd5', address: '0xEeFFaa00112233445566778899aabbccddeeff00', short: '0xEeFF…ff00', roleZh: '社区委员', roleEn: 'Community' },
  ],
};

export const multisigProposals: MultisigProposal[] = [
  {
    id: 'p1',
    walletType: 'line',
    titleZh: '2026年7月本线分红发放',
    titleEn: 'Jul 2026 line dividend distribution',
    descZh: '按本线业绩向 48 名股东分配 USD3 + D3',
    descEn: 'Distribute USD3 + D3 to 48 line shareholders by performance',
    periodZh: '2026年7月',
    periodEn: 'Jul 2026',
    usd3Amount: 186.4,
    d3Amount: 12.8,
    beneficiaryCount: 48,
    proposerShort: '0x1234…5678',
    createdAt: '2026-07-28',
    expiresAt: '2026-08-02',
    status: 'pending',
    signatures: [
      { signerId: 'me', signedAt: '2026-07-28 14:20' },
      { signerId: 's2', signedAt: null },
      { signerId: 's3', signedAt: null },
    ],
  },
  {
    id: 'p2',
    walletType: 'line',
    titleZh: '2026年6月本线分红发放',
    titleEn: 'Jun 2026 line dividend distribution',
    descZh: '月度分红已执行，链上可查',
    descEn: 'Monthly dividend executed — verifiable on-chain',
    periodZh: '2026年6月',
    periodEn: 'Jun 2026',
    usd3Amount: 142.3,
    d3Amount: 9.6,
    beneficiaryCount: 45,
    proposerShort: '0x1234…5678',
    createdAt: '2026-06-28',
    expiresAt: '2026-07-02',
    status: 'executed',
    signatures: [
      { signerId: 'me', signedAt: '2026-06-28 10:15' },
      { signerId: 's2', signedAt: '2026-06-28 16:40' },
      { signerId: 's3', signedAt: '2026-06-29 09:05' },
    ],
    executedAt: '2026-06-29 09:12',
    txHash: '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890',
  },
  {
    id: 'p3',
    walletType: 'dao',
    titleZh: '2026年7月国库 USD3 分配',
    titleEn: 'Jul 2026 treasury USD3 allocation',
    descZh: '市值管理套利收益按权益池分配',
    descEn: 'Treasury arb yield allocated to equity pool',
    periodZh: '2026年7月',
    periodEn: 'Jul 2026',
    usd3Amount: 24_800,
    d3Amount: 860,
    beneficiaryCount: 320,
    proposerShort: '0xAAaa…6677',
    createdAt: '2026-07-25',
    expiresAt: '2026-08-05',
    status: 'pending',
    signatures: [
      { signerId: 'd1', signedAt: '2026-07-25 11:00' },
      { signerId: 'd2', signedAt: '2026-07-26 08:30' },
      { signerId: 'd3', signedAt: null },
      { signerId: 'd4', signedAt: null },
      { signerId: 'd5', signedAt: null },
    ],
  },
];

