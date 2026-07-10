import { useMemo, useState } from 'react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { PartnerTeamTree } from '@/components/partner/PartnerTeamTree';
import {
  emptyPartnerTeamNodes,
  type PartnerTeamNode,
} from '@/components/partner/partnerTeamData';
import {
  BRIBE_TIER_MIN_USD,
  BRIBE_TIERS,
  calcDailySd3,
  getBribeTier,
  getSd3Quotas,
  type PartnerState,
} from '@/components/partner/partnerData';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { buildReferralLink } from '@/lib/referral';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const TIER_KEYS = ['tier.proBribe', 'tier.seniorBribe', 'tier.director', 'tier.chief'] as const;

type TeamSub = 'overview' | 'tree';

export function PartnerTeamTab({
  lang,
  isDark,
  state,
  wallet,
  teamNodes,
  teamStats,
  teamLoading,
  onTransferSd3,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  wallet: string | null;
  teamNodes: Record<string, PartnerTeamNode>;
  teamStats: PartnerTeamStats;
  teamLoading: boolean;
  onTransferSd3?: (toAddress: string, amount: number) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const referralLink = buildReferralLink(wallet);
  const isPartner = state.isPartner;
  const transferQuota = getSd3Quotas(state).transferQuota;
  const teamPerformanceUsd = teamStats.teamPerformanceUsd;
  const dailyNewPerformanceUsd = teamStats.dailyNewPerformanceUsd;
  const tier = isPartner ? getBribeTier(teamPerformanceUsd) : null;
  const tierIdx = tier ? BRIBE_TIERS.indexOf(tier) : -1;
  const expectedSd3 = calcDailySd3(teamPerformanceUsd, dailyNewPerformanceUsd, isPartner);
  const [sub, setSub] = useState<TeamSub>(isPartner ? 'overview' : 'tree');

  const treeNodes = useMemo(() => {
    if (teamNodes.me) return teamNodes;
    if (wallet) return emptyPartnerTeamNodes(wallet);
    return {};
  }, [teamNodes, wallet]);

  const history = state.sd3SettlementHistory ?? [];
  const displaySd3Earned = history.length > 0 ? state.dailySd3Earned : expectedSd3;

  const subs = [
    { id: 'overview', label: p('team.performance') },
    { id: 'tree', label: p('team.tree') },
  ];

  return (
    <div className="space-y-4">
      <div className={`partner-elevated-card p-4 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="site-section-title mb-2">{p('team.referralTitle')}</div>
        <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
          {p('team.referralDesc')}
        </p>
        <AddressBlock value={referralLink} isDark={isDark} />
      </div>

      {!isPartner && (
        <div className={`text-center text-xs py-3 px-4 rounded-xl ${isDark ? 'bg-white/5 text-white/45' : 'bg-black/[0.03] text-[#160510]/50'}`}>
          {p('team.sd3PartnerOnly')}
        </div>
      )}

      <SectionTabBar tabs={subs} active={sub} onChange={(id) => setSub(id as TeamSub)} isDark={isDark} />

      {sub === 'overview' && (
        <>
          <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('team.teamTotal')}</div>
                <div className="site-stat-value-lg site-stat-value-accent">${teamPerformanceUsd.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('team.todayNew')}</div>
                <div className="site-stat-value-lg text-emerald-500">${dailyNewPerformanceUsd.toLocaleString()}</div>
              </div>
            </div>
            {isPartner && tier && tierIdx >= 0 && (
              <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {p('team.bribeTierLine', {
                  rate: tier.ratePct,
                  tier: p(TIER_KEYS[tierIdx]),
                  sd3: expectedSd3.toLocaleString(),
                })}
              </div>
            )}
            {isPartner && !tier && (
              <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {p('team.bribeBelowMin', { min: BRIBE_TIER_MIN_USD })}
              </div>
            )}
          </div>

          {isPartner && (
            <>
              <div className={glassCardClass('default', 'p-5 text-center')}>
                <div className="site-stat-label">
                  {history.length > 0 ? p('team.yesterdaySd3') : p('team.estimatedSd3')}
                </div>
                <div className="text-3xl font-black text-[#E0568F] my-1">{displaySd3Earned.toLocaleString()}</div>
                <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                  {history.length > 0 ? state.lastSettlementDate : p('team.estimatedSd3Hint')}
                </div>
              </div>

              <div className={glassCardClass('default', 'p-5')}>
                <div className="site-section-title mb-3">{p('team.sd3History')}</div>
                {history.length === 0 ? (
                  <div className={`text-center text-sm py-4 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                    {p('team.sd3HistoryEmpty')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((row) => (
                      <div key={row.id} className="ios-glass-inset p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{row.settledAt}</div>
                          <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                            {row.tierRatePct}% · {p('team.sd3HistoryNewPerf', { amount: row.dailyNewPerformanceUsd.toLocaleString() })}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-[#E0568F]">+{row.sd3Amount.toLocaleString()} sD3</div>
                          <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                            ${row.teamPerformanceUsd.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {sub === 'tree' && (
        <PartnerTeamTree
          lang={lang}
          isDark={isDark}
          nodes={treeNodes}
          loading={teamLoading}
          isPartner={isPartner}
          transferQuota={transferQuota}
          onTransferSd3={isPartner ? onTransferSd3 : undefined}
        />
      )}
    </div>
  );
}
