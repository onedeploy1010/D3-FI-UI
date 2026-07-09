import type { BribeProjectRow, BribeProjectView, ProtocolBundle, ProtocolEpochRow, ProtocolEpochView } from './protocolTypes';
import {
  formatCompactD3,
  formatCompactUsd,
  formatCountdown,
  formatDeadline,
  formatPerVote,
  formatSignedCompactUsd,
  formatUsdAmount,
  formatVoteCount,
} from './protocolFormat';

export async function fetchProtocolBundle(): Promise<ProtocolBundle> {
  const res = await fetch('/api/union/protocol');
  const body = (await res.json().catch(() => ({}))) as ProtocolBundle & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

export function mapEpochView(
  epoch: ProtocolEpochRow | null,
  activeProjectCount: number,
  lang: 'zh' | 'en',
): ProtocolEpochView | null {
  if (!epoch) return null;
  return {
    label: epoch.label,
    epochNumber: epoch.epoch_number,
    phase: epoch.phase,
    bribePoolAdded: formatSignedCompactUsd(num(epoch.bribe_pool_added_usd)),
    bribePoolTvl: formatCompactUsd(num(epoch.bribe_pool_tvl_usd)),
    monthlyEmission: formatCompactD3(num(epoch.monthly_emission_d3)),
    countdown: formatCountdown(epoch.settlement_at, lang),
    settlementAt: epoch.settlement_at,
    activeProjectCount,
  };
}

export function mapBribeProject(row: BribeProjectRow, epochLabel: string, lang: 'zh' | 'en'): BribeProjectView {
  return {
    id: row.id,
    name: row.name,
    nameZh: row.name_zh,
    gauge: row.gauge,
    bribeAmount: formatUsdAmount(num(row.bribe_amount_usd)),
    perVote: formatPerVote(num(row.per_vote_usd)),
    deadline: formatDeadline(row.deadline_at, lang),
    status: row.status,
    descriptionZh: row.description_zh ?? '',
    descriptionEn: row.description_en ?? '',
    website: row.website ?? '#',
    totalVotes: formatVoteCount(num(row.total_votes)),
    voters: row.voters,
    epoch: epochLabel,
  };
}

export function mapBribeProjects(
  rows: BribeProjectRow[],
  epochLabel: string,
  lang: 'zh' | 'en',
): BribeProjectView[] {
  return rows.map((row) => mapBribeProject(row, epochLabel, lang));
}
