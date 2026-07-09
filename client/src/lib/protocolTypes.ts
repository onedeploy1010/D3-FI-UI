export type ProtocolEpochRow = {
  id: string;
  epoch_number: number;
  label: string;
  phase: 'lock' | 'voting' | 'bribe' | 'settle' | 'claim';
  bribe_pool_added_usd: number;
  bribe_pool_tvl_usd: number;
  monthly_emission_d3: number;
  settlement_at: string;
  started_at: string;
  is_current: boolean;
};

export type BribeProjectRow = {
  id: string;
  epoch_number: number;
  name: string;
  name_zh: string;
  gauge: string;
  bribe_amount_usd: number;
  per_vote_usd: number;
  deadline_at: string | null;
  status: 'active' | 'ended';
  description_zh: string | null;
  description_en: string | null;
  website: string | null;
  total_votes: number;
  voters: number;
  sort_order: number;
};

export type ProtocolBundle = {
  epoch: ProtocolEpochRow | null;
  bribeProjects: BribeProjectRow[];
  migrated: boolean;
};

export type BribeProjectView = {
  id: string;
  name: string;
  nameZh: string;
  gauge: string;
  bribeAmount: string;
  perVote: string;
  deadline: string;
  status: 'active' | 'ended';
  descriptionZh: string;
  descriptionEn: string;
  website: string;
  totalVotes: string;
  voters: number;
  epoch: string;
};

export type ProtocolEpochView = {
  label: string;
  epochNumber: number;
  phase: ProtocolEpochRow['phase'];
  bribePoolAdded: string;
  bribePoolTvl: string;
  monthlyEmission: string;
  countdown: string;
  settlementAt: string;
  activeProjectCount: number;
};
