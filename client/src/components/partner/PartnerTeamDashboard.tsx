import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import {
  BRIBE_TIERS,
  calcDailySd3,
  getBribeTier,
  partnerTreeLevelKey,
  type PartnerState,
} from '@/components/partner/partnerData';
import { computePartnerAreaStats, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { PartnerDualAnimatedBar, PartnerLevelBadge } from '@/components/partner/partnerUiKit';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const TIER_KEYS = ['tier.proBribe', 'tier.seniorBribe', 'tier.director', 'tier.chief'] as const;

export function PartnerTeamDashboard({
  lang,
  isDark,
  wallet,
  state,
  teamStats,
  teamNodes,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  state: PartnerState;
  teamStats: PartnerTeamStats;
  teamNodes: Record<string, PartnerTeamNode>;
}) {
  const p = usePartnerTranslation(lang);
  const isPartner = state.isPartner;
  const tier = isPartner ? getBribeTier(teamStats.teamPerformanceUsd) : null;
  const tierIdx = tier ? BRIBE_TIERS.indexOf(tier) : -1;
  const levelKey = partnerTreeLevelKey(isPartner, teamStats.teamPerformanceUsd);
  const levelLabel = p(levelKey);

  const areas = useMemo(() => computePartnerAreaStats(teamNodes), [teamNodes]);
  const expectedSd3 = calcDailySd3(teamStats.teamPerformanceUsd, teamStats.dailyNewPerformanceUsd, isPartner);
  const lifetimeSd3 = state.lifetimeSd3Earned;
  const pendingSd3 = expectedSd3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`partner-elevated-card overflow-hidden ${glassCardClass('highlight', '')}`}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />

      <div className="relative px-4 pt-3.5 pb-3 border-b border-[#E0568F]/10 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <PartnerLevelBadge label={levelLabel} />
          {isPartner && tier && tierIdx >= 0 && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isDark ? 'bg-white/[0.06] text-white/55' : 'bg-[#160510]/5 text-[#160510]/60'
              }`}
            >
              {tier.ratePct}% · {p(TIER_KEYS[tierIdx])}
            </span>
          )}
        </div>
        {wallet && (
          <AddressBlock value={wallet} isDark={isDark} compact dense showCopy surface="inset" />
        )}
      </div>

      <div className="relative px-4 py-3.5 space-y-2.5">
        <PartnerDualAnimatedBar
          title={p('team.smallArea')}
          totalLabel={p('team.totalShort')}
          totalValue={areas.smallAreaUsd}
          totalDisplay={`$${areas.smallAreaUsd.toLocaleString()}`}
          newLabel={p('team.newShort')}
          newValue={areas.smallAreaNewUsd}
          newDisplay={`$${areas.smallAreaNewUsd.toLocaleString()}`}
          isDark={isDark}
          totalAccent="#E0568F"
          newAccent="#f472b6"
          featured
          featuredHint={p('team.smallAreaSd3Basis')}
        />
        <PartnerDualAnimatedBar
          title={p('team.largeArea')}
          totalLabel={p('team.totalShort')}
          totalValue={areas.largeAreaUsd}
          totalDisplay={`$${areas.largeAreaUsd.toLocaleString()}`}
          newLabel={p('team.newShort')}
          newValue={areas.largeAreaNewUsd}
          newDisplay={`$${areas.largeAreaNewUsd.toLocaleString()}`}
          isDark={isDark}
          totalAccent="#8A2B57"
          newAccent="#a855f7"
        />
        <PartnerDualAnimatedBar
          title={p('team.sd3Rewards')}
          totalLabel={p('team.totalShort')}
          totalValue={lifetimeSd3}
          totalDisplay={`${lifetimeSd3.toLocaleString()} sD3`}
          newLabel={p('team.newShort')}
          newValue={pendingSd3}
          newDisplay={`${pendingSd3.toLocaleString()} sD3`}
          isDark={isDark}
          totalAccent="#E0568F"
          newAccent="#f59e0b"
          badge={p('team.unsettledBadge')}
        />
      </div>
    </motion.div>
  );
}
