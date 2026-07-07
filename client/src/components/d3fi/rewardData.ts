/** Reward taxonomy aligned with whitepaper + market PPT + dUSD product layer */

/** Referral reward on downline entry: 30% total, 100% dUSD (for staking/investment, not withdrawal) */
export const REFERRAL_REWARD_RATE = 0.3;
export const REFERRAL_DUSD_SELF_RATE = 0.15;
export const REFERRAL_DUSD_TRANSFERABLE_RATE = 0.15;

/** Epoch #42 — downline entry × 30%, all dUSD */
export const referralEpoch = {
  epoch: '#42',
  /** Total accrued this epoch (e.g. $2,000 downline entry × 30%) */
  total: 600,
  /** Already credited to dUSD balance / transferable quota */
  claimed: 360,
};

export const referralPending = {
  total: referralEpoch.total - referralEpoch.claimed, // 240
  self: (referralEpoch.total - referralEpoch.claimed) / 2, // 120
  transferable: (referralEpoch.total - referralEpoch.claimed) / 2, // 120
  epoch: referralEpoch.epoch,
};

/** Cumulative transferable quota from previously claimed referral rewards */
export const transferableQuota = {
  /** Total transferable credited from past claimed epochs */
  credited: 180,
  used: 75,
  get remaining() {
    return this.credited - this.used; // 105
  },
};

/** dUSD account snapshot — numbers must stay internally consistent */
export const dUsdAccount = {
  total: 3200,
  staked: 2000,
  available: 1200,
};

export const teamRewardPending = referralPending;

export type RewardStream = {
  id: string;
  titleZh: string;
  titleEn: string;
  assetZh: string;
  assetEn: string;
  whereZh: string;
  whereEn: string;
  descZh: string;
  descEn: string;
};

export const rewardStreams: RewardStream[] = [
  {
    id: 'governance',
    titleZh: '治理分红',
    titleEn: 'Governance dividends',
    assetZh: 'USDT',
    assetEn: 'USDT',
    whereZh: '收益 → 总览',
    whereEn: 'Earn → Overview',
    descZh: 'veD3 投票：贿赂 + LP 手续费 + DT 权重分红等，结算后以 USDT 直接领取到钱包。与推荐奖励无关。',
    descEn: 'veD3 votes: bribes, LP fees, DT weight share, etc. — claimed as USDT directly to your wallet. Not referral rewards.',
  },
  {
    id: 'static',
    titleZh: '静态质押收益',
    titleEn: 'Static yield',
    assetZh: 'D3',
    assetEn: 'D3',
    whereZh: '收益 → 总览',
    whereEn: 'Earn → Overview',
    descZh: '按锁仓期限与全网质押率计算日化；30 天线性释放。',
    descEn: 'Daily yield by lock period & network stake rate; 30d linear vesting.',
  },
  {
    id: 'poc',
    titleZh: '动态 · PoC 级差',
    titleEn: 'Dynamic · PoC diff.',
    assetZh: 'D3 / USDT',
    assetEn: 'D3 / USDT',
    whereZh: '我的 → 推荐 / 收益',
    whereEn: 'Me → Refer / Earn',
    descZh: '下级动态收益 × 你的实际级差（V 级门槛 + PoC 决定）。180 天线性释放。',
    descEn: 'Downline dynamic × your rate (V level + PoC). 180d linear vesting.',
  },
  {
    id: 'pon',
    titleZh: '动态 · PoN 算力奖',
    titleEn: 'Dynamic · PoN bonus',
    assetZh: 'D3 / USDT',
    assetEn: 'D3 / USDT',
    whereZh: '我的 → 推荐 / 收益',
    whereEn: 'Me → Refer / Earn',
    descZh: '(个人小区算力 ÷ 全网算力) × 递减系数 × PoN 池；与级差叠加。',
    descEn: '(Your small-area hashpower ÷ network) × decay × PoN pool; stacks with PoC diff.',
  },
  {
    id: 'referral',
    titleZh: '推荐奖励（入金 30%）',
    titleEn: 'Referral (30% of entry)',
    assetZh: '100% dUSD',
    assetEn: '100% dUSD',
    whereZh: '推荐页 + 资产 → dUSD',
    whereEn: 'Refer tab + Assets → dUSD',
    descZh: '下级入金的 30% 全部以 dUSD 入账，用于质押投资，不可提现。其中 15% 自留 + 15% 可转让直推下线。',
    descEn: '30% of downline entry paid entirely in dUSD for staking/investment — not withdrawable. 15% self + 15% transferable to direct downline.',
  },
  {
    id: 'dusd',
    titleZh: 'dUSD 推荐份额',
    titleEn: 'dUSD referral share',
    assetZh: 'dUSD（入金 30%）',
    assetEn: 'dUSD (30% of entry)',
    whereZh: '资产 → dUSD',
    whereEn: 'Assets → dUSD',
    descZh: '推荐奖励全部记入 dUSD 余额；可转让额度仅来自其中 15%，且只能转给直推下线用于质押。',
    descEn: 'All referral rewards credit as dUSD; transferable quota is the 15% slice only, to direct downline for staking.',
  },
];

export type TeamRewardLine = {
  id: string;
  date: string;
  sourceZh: string;
  sourceEn: string;
  dusd: number;
};

export const recentTeamRewards: TeamRewardLine[] = [
  { id: 'r1', date: '2026-07-06', sourceZh: '推荐奖励', sourceEn: 'Referral reward', dusd: 150 },
  { id: 'r2', date: '2026-07-05', sourceZh: 'PoC 级差', sourceEn: 'PoC differential', dusd: 0 },
  { id: 'r3', date: '2026-07-04', sourceZh: 'PoN 算力奖', sourceEn: 'PoN bonus', dusd: 0 },
];
