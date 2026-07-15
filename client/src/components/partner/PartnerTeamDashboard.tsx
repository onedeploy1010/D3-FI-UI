import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { type PartnerState } from '@/components/partner/partnerData';
import { type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { resolvePartnerSd3Metrics } from '@/components/partner/partnerSd3View';
import {
  getUd3Tier,
  isUd3PlanEligible,
  resolveUd3SLevel,
  UD3_PLAN_MIN_STAKE_USDT,
} from '@/components/partner/ud3Rules';
import { PartnerDualAnimatedBar, PartnerLevelBadge } from '@/components/partner/partnerUiKit';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

export function PartnerTeamDashboard({
  lang,
  isDark,
  wallet,
  state,
  teamStats,
  teamNodes,
  pendingSd3Earned = 0,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  state: PartnerState;
  teamStats: PartnerTeamStats;
  teamNodes: Record<string, PartnerTeamNode>;
  pendingSd3Earned?: number;
}) {
  const p = usePartnerTranslation(lang);
  const metrics = useMemo(
    () => resolvePartnerSd3Metrics(state, teamNodes, teamStats, pendingSd3Earned),
    [state, teamNodes, teamStats, pendingSd3Earned],
  );
  const areas = metrics.areas;
  const totalPerf = teamStats.teamPerformanceUsd ?? 0;
  const totalNew = teamStats.dailyNewPerformanceUsd ?? 0;
  const personalStake = teamStats.personalPerformanceUsd ?? 0;
  const planEligible = isUd3PlanEligible(personalStake) || state.isPartner;

  const tier = getUd3Tier(totalPerf);
  const sLevel = resolveUd3SLevel({
    totalPerfUsdt: totalPerf,
    smallAreaPerfUsdt: areas.smallAreaUsd,
  });

  const lifetimeUd3 = metrics.lifetimeSd3;
  const pendingUd3 = metrics.pendingSd3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`partner-elevated-card overflow-hidden ${glassCardClass('highlight', '')}`}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />

      <div className="relative px-4 pt-3.5 pb-3 border-b border-[#E0568F]/10 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {tier ? (
            <PartnerLevelBadge
              label={`${tier.label} · ${tier.ratePct}%`}
            />
          ) : (
            <PartnerLevelBadge label={p('ud3.tierNone')} />
          )}
          {sLevel ? (
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                isDark
                  ? 'text-[#F5D0A9] bg-[#F5D0A9]/10 border-[#F5D0A9]/25'
                  : 'text-[#8A2B57] bg-[#8A2B57]/8 border-[#8A2B57]/20'
              }`}
            >
              {sLevel.label}
              <span className="ml-1 opacity-70">{sLevel.sharePct}%</span>
            </span>
          ) : (
            <span
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border border-dashed ${
                isDark ? 'text-white/35 border-white/15' : 'text-[#160510]/40 border-[#160510]/15'
              }`}
            >
              {p('ud3.sNone')}
            </span>
          )}
        </div>
        {!planEligible && (
          <p className={`text-[10px] mb-2 ${isDark ? 'text-amber-200/70' : 'text-amber-800/70'}`}>
            {p('ud3.planMinHint', { min: UD3_PLAN_MIN_STAKE_USDT })}
          </p>
        )}
        {wallet && (
          <AddressBlock value={wallet} isDark={isDark} compact dense showCopy surface="inset" />
        )}
      </div>

      <div className="relative px-4 py-3.5 space-y-2.5">
        {/* S1–S2 focus: 总业绩 */}
        <PartnerDualAnimatedBar
          title={p('team.totalPerf')}
          totalLabel={p('team.totalShort')}
          totalValue={totalPerf}
          totalDisplay={`$${totalPerf.toLocaleString()}`}
          newLabel={p('team.todayNew')}
          newValue={totalNew}
          newDisplay={`$${totalNew.toLocaleString()}`}
          isDark={isDark}
          totalAccent="#8A2B57"
          newAccent="#c084fc"
          featured={Boolean(sLevel && sLevel.id <= 2)}
          featuredHint={sLevel && sLevel.id <= 2 ? p('ud3.assessBadge') : undefined}
          badge={totalNew > 0 ? p('team.unsettledBadge') : undefined}
        />
        {/* S3–S6 focus: 小区业绩（不展示大区） */}
        <PartnerDualAnimatedBar
          title={p('team.smallArea')}
          totalLabel={p('team.totalShort')}
          totalValue={areas.smallAreaUsd}
          totalDisplay={`$${areas.smallAreaUsd.toLocaleString()}`}
          newLabel={p('team.todayNew')}
          newValue={areas.smallAreaNewUsd}
          newDisplay={`$${areas.smallAreaNewUsd.toLocaleString()}`}
          isDark={isDark}
          totalAccent="#E0568F"
          newAccent="#f472b6"
          featured={Boolean(!sLevel || sLevel.id >= 3)}
          featuredHint={!sLevel || sLevel.id >= 3 ? p('ud3.assessBadge') : undefined}
          badge={areas.smallAreaNewUsd > 0 ? p('team.unsettledBadge') : undefined}
        />
        <PartnerDualAnimatedBar
          title={p('team.ud3Rewards')}
          totalLabel={p('team.settledShort')}
          totalValue={lifetimeUd3}
          totalDisplay={`${lifetimeUd3.toLocaleString()} UD3`}
          newLabel={p('team.unsettledBadge')}
          newValue={pendingUd3}
          newDisplay={`${pendingUd3.toLocaleString()} UD3`}
          isDark={isDark}
          totalAccent="#E0568F"
          newAccent="#f59e0b"
          badge={p('team.unsettledBadge')}
        />
      </div>
    </motion.div>
  );
}
