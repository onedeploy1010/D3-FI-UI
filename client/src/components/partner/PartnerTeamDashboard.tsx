import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import {
  BRIBE_TIERS,
  getBribeTier,
  partnerTreeLevelKey,
  type PartnerState,
} from '@/components/partner/partnerData';
import { type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { resolvePartnerSd3Metrics } from '@/components/partner/partnerSd3View';
import { PartnerDualAnimatedBar, PartnerLevelBadge } from '@/components/partner/partnerUiKit';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const TIER_KEYS = ['tier.proBribe', 'tier.seniorBribe', 'tier.director', 'tier.chief'] as const;

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
  const isPartner = state.isPartner;
  const areas = sd3Metrics.areas;
  const sd3Metrics = useMemo(
    () => resolvePartnerSd3Metrics(state, teamNodes, teamStats, pendingSd3Earned),
    [state, teamNodes, teamStats, pendingSd3Earned],
  );
  const sd3Tier = isPartner ? getBribeTier(areas.smallAreaUsd) : null;
  const sd3TierIdx = sd3Tier ? BRIBE_TIERS.indexOf(sd3Tier) : -1;
  const levelKey = partnerTreeLevelKey(isPartner, teamStats.teamPerformanceUsd);
  const levelLabel = p(levelKey);
  const lifetimeSd3 = sd3Metrics.lifetimeSd3;
  const pendingSd3 = sd3Metrics.pendingSd3;

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
          {isPartner && sd3Tier && sd3TierIdx >= 0 && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isDark ? 'bg-white/[0.06] text-white/55' : 'bg-[#160510]/5 text-[#160510]/60'
              }`}
            >
              {sd3Tier.ratePct}% · {p(TIER_KEYS[sd3TierIdx])}
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
