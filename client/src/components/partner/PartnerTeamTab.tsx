import { useMemo, useState } from 'react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { PartnerTeamTree } from '@/components/partner/PartnerTeamTree';
import { PartnerTeamDashboard } from '@/components/partner/PartnerTeamDashboard';
import { PartnerReferralCard } from '@/components/partner/PartnerReferralCard';
import { PartnerTransferGuide } from '@/components/partner/PartnerTransferGuide';
import { PartnerListFilters } from '@/components/partner/partnerUiKit';
import {
  emptyPartnerTeamNodes,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import { getSd3Quotas, type PartnerState } from '@/components/partner/partnerData';
import { AddressBlock } from '@/components/ui/AddressBlock';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { buildReferralLink } from '@/lib/referral';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type TeamSub = 'tree' | 'sd3';

type Sd3Sort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export function PartnerTeamTab({
  lang,
  isDark,
  state,
  wallet,
  teamNodes,
  teamStats,
  teamLoading,
  pendingSd3Earned = 0,
  onTransferSd3,
  transferGuideActive,
  onTransferGuideComplete,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  wallet: string | null;
  teamNodes: Record<string, PartnerTeamNode>;
  teamStats: PartnerTeamStats;
  teamLoading: boolean;
  pendingSd3Earned?: number;
  onTransferSd3?: (toAddress: string, amount: number) => Promise<boolean>;
  transferGuideActive?: boolean;
  onTransferGuideComplete?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const referralLink = buildReferralLink(wallet);
  const isPartner = state.isPartner;
  const transferQuota = getSd3Quotas(state).transferQuota;
  const [sub, setSub] = useState<TeamSub>('tree');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<Sd3Sort>('date_desc');

  const treeNodes = useMemo(() => {
    if (teamNodes.me) return teamNodes;
    if (wallet) return emptyPartnerTeamNodes(wallet);
    return {};
  }, [teamNodes, wallet]);

  const history = state.sd3SettlementHistory ?? [];

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = history.filter((row) => {
      if (dateFrom && row.settledAt < dateFrom) return false;
      if (dateTo && row.settledAt > dateTo) return false;
      if (!q) return true;
      const hay = [
        row.id,
        row.settledAt,
        String(row.sd3Amount),
        String(row.teamPerformanceUsd),
        row.role ?? '',
        row.sourceAddress ?? '',
        row.sourceLabel ?? '',
        String(row.rewardSharePct ?? ''),
        String(row.tierRatePct),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'date_asc') return a.settledAt.localeCompare(b.settledAt);
      if (sort === 'amount_desc') return b.sd3Amount - a.sd3Amount;
      if (sort === 'amount_asc') return a.sd3Amount - b.sd3Amount;
      return b.settledAt.localeCompare(a.settledAt);
    });
    return rows;
  }, [history, search, dateFrom, dateTo, sort]);

  const subs = [
    { id: 'tree', label: p('team.referralDetail') },
    { id: 'sd3', label: p('team.sd3Rewards') },
  ];

  const sortOptions = [
    { id: 'date_desc', label: p('filters.sortDateDesc') },
    { id: 'date_asc', label: p('filters.sortDateAsc') },
    { id: 'amount_desc', label: p('filters.sortAmountDesc') },
    { id: 'amount_asc', label: p('filters.sortAmountAsc') },
  ];

  return (
    <div className="space-y-4">
      <PartnerReferralCard lang={lang} isDark={isDark} referralLink={referralLink} />

      {!isPartner && (
        <div className={`text-center text-xs py-3 px-4 rounded-xl ${isDark ? 'bg-white/5 text-white/45' : 'bg-black/[0.03] text-[#160510]/50'}`}>
          {p('team.sd3PartnerOnly')}
        </div>
      )}

      <PartnerTeamDashboard
        lang={lang}
        isDark={isDark}
        wallet={wallet}
        state={state}
        teamStats={teamStats}
        teamNodes={treeNodes}
        pendingSd3Earned={pendingSd3Earned}
      />

      <SectionTabBar tabs={subs} active={sub} onChange={(id) => setSub(id as TeamSub)} isDark={isDark} />

      {sub === 'tree' && (
        <PartnerTeamTree
          lang={lang}
          isDark={isDark}
          wallet={wallet}
          nodes={treeNodes}
          loading={teamLoading}
          isPartner={isPartner}
          transferQuota={transferQuota}
          onTransferSd3={isPartner ? onTransferSd3 : undefined}
        />
      )}

      {sub === 'sd3' && (
        <div className="space-y-3">
          {!isPartner ? (
            <div className={`text-center py-12 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
              {p('team.sd3PartnerOnly')}
            </div>
          ) : (
            <>
              <PartnerListFilters
                isDark={isDark}
                p={p}
                search={search}
                onSearchChange={setSearch}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                sortLabel={p('filters.sort')}
                sortValue={sort}
                sortOptions={sortOptions}
                onSortChange={(v) => setSort(v as Sd3Sort)}
              />

              {filteredHistory.length === 0 ? (
                <div className={`text-center text-sm py-10 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                  {history.length === 0 ? p('team.sd3HistoryEmpty') : p('filters.noResults')}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredHistory.map((row) => {
                    const roleLabel =
                      row.role === 'upline' ? p('team.sd3RoleUpline') : p('team.sd3RoleDirect');
                    const roleCls =
                      row.role === 'upline'
                        ? 'text-violet-500 bg-violet-500/10 border-violet-500/20'
                        : 'text-sky-500 bg-sky-500/10 border-sky-500/20';
                    return (
                    <div key={row.id} className={`partner-elevated-card p-4 ${glassCardClass('default', '')}`}>
                      <span className="ios-glass-sheen pointer-events-none" aria-hidden />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleCls}`}>
                              {roleLabel}
                            </span>
                            {row.tierRatePct > 0 && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isDark ? 'bg-white/[0.06] text-white/55' : 'bg-[#160510]/5 text-[#160510]/60'
                                }`}
                              >
                                {row.tierRatePct}%
                              </span>
                            )}
                            {row.rewardSharePct != null && row.rewardSharePct > 0 && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-500/10 text-amber-700'
                                }`}
                              >
                                {p('team.sd3RewardShare', { pct: row.rewardSharePct })}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{row.settledAt}</div>
                          {row.sourceAddress && (
                            <div className="mt-2">
                              <div className={`text-[10px] mb-1 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                                {p('team.sd3FromAddress')}
                              </div>
                              <AddressBlock
                                label={row.sourceLabel}
                                value={row.sourceAddress}
                                isDark={isDark}
                                compact
                                dense
                                surface="inset"
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-[#E0568F]">+{row.sd3Amount.toLocaleString()} sD3</div>
                          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                            {p('team.sd3HistoryNewPerf', { amount: row.dailyNewPerformanceUsd.toLocaleString() })}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <PartnerTransferGuide
        lang={lang}
        isDark={isDark}
        active={Boolean(transferGuideActive)}
        onComplete={() => onTransferGuideComplete?.()}
      />
    </div>
  );
}
