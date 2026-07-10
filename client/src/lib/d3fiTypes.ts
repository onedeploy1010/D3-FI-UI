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
};

export type PartnerTeamStats = {
  personalPerformanceUsd: number;
  /** 伞下累计业绩（用于受贿金等级） */
  teamPerformanceUsd: number;
  dailyNewPerformanceUsd: number;
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
  /** Wallets with completed partner join (入盟). */
  partnerMemberWallets?: string[];
};
