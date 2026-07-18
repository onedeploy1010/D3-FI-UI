export type Usd3Account = {
  wallet_address: string;
  pending_usd3: number;
  claimed_lifetime_usd3: number;
  balance: number;
  available: number;
  self_pool_remaining: number;
  downline_pool_remaining: number;
  moved_to_fi: number;
  transferred_to_downline: number;
  self_quota: number;
  downline_quota: number;
};

export type D3Account = {
  wallet_address: string;
  pending_d3: number;
  claimed_lifetime_d3: number;
  claim_wallet_address: string | null;
};

export type ShareholderRow = {
  wallet_address: string;
  is_shareholder: boolean;
  genesis_dt_count: number;
  level_label: string;
  line_performance_usd: number;
  network_performance_usd: number;
  status: string;
};

export type DividendAccrual = {
  id: string;
  wallet_address: string;
  asset_type: 'usd3' | 'd3';
  stream_id: 'fees' | 'treasury' | 'line';
  amount: number;
  period_label: string | null;
  cycle_type: string;
  status: 'pending' | 'multisig_pending' | 'claimable' | 'claimed' | 'none';
  source_zh: string | null;
  source_en: string | null;
  multisig_proposal_id?: string | null;
  settled_at: string | null;
  claimed_at: string | null;
  created_at: string;
};

export type FiPosition = {
  id: string;
  wallet_address: string;
  position_type: 'lp' | 'burn_bond' | 'spot' | 'governance' | 've_lock';
  asset_pair: string | null;
  principal_usd3: number | null;
  principal_d3: number | null;
  principal_usdt: number | null;
  lock_days: number | null;
  locked_until: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TeamNodeRow = {
  id: string;
  line_id?: string;
  wallet_address: string;
  parent_node_id?: string | null;
  level_label: string;
  personal_usd: number;
  team_usd: number;
  direct_count: number;
  team_count: number;
  is_direct: boolean;
};

export type UnionLineRow = {
  id: string;
  line_leader_wallet: string;
  name: string | null;
  total_members: number;
  total_performance_usd: number;
};

export type MultisigWalletRow = {
  id: string;
  line_id: string | null;
  wallet_type: 'line' | 'dao';
  treasury_address: string;
  short_address: string | null;
  label_zh: string | null;
  label_en: string | null;
  threshold: number;
  total_signers: number;
  balance_usd3: number;
  balance_d3: number;
  privy_key_quorum_id?: string | null;
  privy_wallet_id?: string | null;
};

export type CommitteeMemberRow = {
  id: string;
  multisig_wallet_id: string;
  signer_wallet: string;
  role_zh: string | null;
  role_en: string | null;
  is_line_leader: boolean;
  sort_order: number;
  dividend_weight_pct?: number | null;
};

export type MultisigProposalRow = {
  id: string;
  multisig_wallet_id: string;
  wallet_type: 'line' | 'dao';
  title_zh: string;
  title_en: string;
  desc_zh: string | null;
  desc_en: string | null;
  period_zh: string | null;
  period_en: string | null;
  usd3_amount: number;
  d3_amount: number;
  beneficiary_count: number;
  proposer_wallet: string | null;
  status: 'pending' | 'executed' | 'rejected';
  created_at: string;
  expires_at: string | null;
  executed_at: string | null;
  tx_hash: string | null;
  onchain_status?: 'off' | 'awaiting_signatures' | 'submitted' | 'confirmed' | 'failed';
};

export type MultisigSignatureRow = {
  id: string;
  proposal_id: string;
  signer_wallet: string;
  signed_at: string | null;
};

export type PocScoreRow = {
  wallet_address: string;
  epoch_label: string;
  level_label: string;
  composite_score: number;
  level_diff_rate: number;
  diff_floor_pct: number;
  diff_ceil_pct: number;
  dim_h: number;
  dim_c: number;
  dim_a: number;
  dim_r: number;
  dim_e: number;
  raw_h_zh: string | null;
  raw_h_en: string | null;
  raw_c_zh: string | null;
  raw_c_en: string | null;
  raw_a_zh: string | null;
  raw_a_en: string | null;
  raw_r_zh: string | null;
  raw_r_en: string | null;
  raw_e_zh: string | null;
  raw_e_en: string | null;
  settled_at: string | null;
  updated_at: string;
};

export type PocDimensionView = {
  key: 'H' | 'C' | 'A' | 'R' | 'E';
  weight: number;
  labelZh: string;
  labelEn: string;
  value: number;
  rawZh: string;
  rawEn: string;
};

export type PocScoreView = {
  compositeScore: number;
  levelDiffRate: number;
  levelLabel: string;
  epochLabel: string;
  diffFloorPct: number;
  diffCeilPct: number;
  dimensions: PocDimensionView[];
  settledAt: string | null;
  updatedAt: string | null;
};

export type DirectReferral = {
  wallet_address: string;
  referred_at: string;
  status: string;
  referral_type: string;
  performance_weight?: number;
  personal_performance_usd?: number;
  team_performance_usd?: number;
  team_count?: number;
};

export type PartnerTeamStats = {
  personalPerformanceUsd: number;
  /** 伞下累计业绩 */
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
  /** 小区累计业绩（UD3 等级依据） */
  smallAreaPerformanceUsd?: number;
  /** 小区当日新增（UD3 计算基数之一） */
  smallAreaNewPerformanceUsd?: number;
  largeAreaPerformanceUsd?: number;
  largeAreaNewPerformanceUsd?: number;
};

export type PartnerYieldWithdrawalRow = {
  id: string;
  wallet_address: string;
  amount_usdt: number;
  net_amount_usdt?: number;
  d3_amount?: number;
  status: 'pending' | 'signing' | 'broadcasted' | 'confirmed' | 'failed';
  tx_hash?: string | null;
  created_at: string;
};

export type PartnerAccountRow = {
  wallet_address: string;
  is_partner: boolean;
  sd3_balance: number;
  pending_usdt_yield: number;
  /** Settled, withdrawable D3 yield (authoritative for flash-swap; 0 until settlement). */
  pending_d3_yield?: number;
  lifetime_sd3_earned: number;
  lifetime_usdt_yield: number;
  joined_at: string | null;
  market_leader_status?: 'none' | 'pending' | 'approved' | 'rejected';
};

export type PartnerStakePositionRow = {
  id: string;
  intent_id: string;
  kind: 'partner_join' | 'crowdfund_stake';
  principal_usdt: number;
  /** D3 price (USDT) locked at stake time — the private-sale round price. */
  d3_price_at_stake?: number | null;
  /** D3 principal = principal_usdt / d3_price_at_stake, locked at stake time. */
  staked_d3?: number | null;
  daily_yield_usdt: number;
  accrued_yield_usdt: number;
  claimed_yield_usdt: number;
  started_at: string;
  unlock_at: string;
  status: string;
};

export type PartnerUd3SettlementRow = {
  id: string;
  settlement_date: string;
  team_performance_usd: number;
  daily_new_performance_usd: number;
  tier_rate_pct: number;
  sd3_amount: number;
};

export type PartnerUd3AllocationRow = {
  id: string;
  recipient_wallet: string;
  source_wallet: string;
  settlement_date: string;
  intent_id?: string | null;
  event_amount_usd: number;
  tier_rate_pct: number;
  reward_share_pct: number;
  role: 'direct' | 'upline';
  sd3_amount: number;
  created_at?: string;
  /** Two-phase settlement (043): false until the daily SGT-midnight run settles it. */
  settled?: boolean;
};

export type PartnerDirectLineStat = {
  wallet: string;
  teamUsd: number;
  dailyNewUsd: number;
};

export type PartnerUd3TransferRow = {
  id: string;
  from_wallet: string;
  to_wallet: string;
  amount_sd3: number;
  status: string;
  created_at: string;
};

export type PartnerYieldSettlementRow = {
  id: string;
  position_id: string;
  settlement_date: string;
  principal_usdt: number;
  daily_rate_pct: number;
  yield_usdt: number;
};

export type UnionProfileBundle = {
  profile: { wallet_address: string; display_name: string | null; short_address: string | null };
  shareholder: ShareholderRow | null;
  usd3Account: Usd3Account | null;
  d3Account: D3Account | null;
  referrals: Array<{ sponsor_wallet_address: string | null; status: string; referral_type: string }>;
  dividends: DividendAccrual[];
  fiPositions: FiPosition[];
  teamNode: TeamNodeRow | null;
  directReferrals: DirectReferral[];
  unionLine: UnionLineRow | null;
  lineTeamNodes: TeamNodeRow[];
  multisigWallets: MultisigWalletRow[];
  committeeMembers: CommitteeMemberRow[];
  multisigProposals: MultisigProposalRow[];
  multisigSignatures: MultisigSignatureRow[];
  pocScore: PocScoreRow | null;
  partnerTeamStats?: PartnerTeamStats;
  partnerDirectLineStats?: PartnerDirectLineStat[];
  /** Today's unsettled UD3 estimate (small-area basis). */
  pendingUd3Earned?: number;
  /** Wallets with completed partner join (入盟). */
  partnerMemberWallets?: string[];
  partnerAccount?: PartnerAccountRow | null;
  partnerStakePositions?: PartnerStakePositionRow[];
  partnerUd3Settlements?: PartnerUd3SettlementRow[];
  partnerUd3Allocations?: PartnerUd3AllocationRow[];
  partnerUd3Transfers?: PartnerUd3TransferRow[];
  partnerYieldSettlements?: PartnerYieldSettlementRow[];
  partnerYieldWithdrawals?: PartnerYieldWithdrawalRow[];
  /** All partner-referral downline wallet addresses (umbrella tree). */
  partnerDownlineWallets?: string[];
  /** Multi-level downline edges (wallet -> sponsor) to nest the tree past direct referrals. */
  partnerDownlineTree?: Array<{
    wallet_address: string;
    sponsor_wallet_address: string | null;
    performance_weight?: number | null;
  }>;
};
