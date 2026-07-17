import { useMemo, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { type PartnerState } from '@/components/partner/partnerData';
import { type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { resolvePartnerUd3Metrics, sumUd3Transferred } from '@/components/partner/partnerUd3View';
import {
  getUd3Tier,
  resolveUd3SLevel,
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
  pendingUd3Earned = 0,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  state: PartnerState;
  teamStats: PartnerTeamStats;
  teamNodes: Record<string, PartnerTeamNode>;
  pendingUd3Earned?: number;
}) {
  const p = usePartnerTranslation(lang);
  const metrics = useMemo(
    () => resolvePartnerUd3Metrics(state, teamNodes, teamStats, pendingUd3Earned),
    [state, teamNodes, teamStats, pendingUd3Earned],
  );
  const areas = metrics.areas;
  /** Prefer tree-derived demo/total performance — API stats can be 0 and falsely show「未达级」. */
  const totalPerf = Math.max(
    teamNodes.me?.teamUsd ?? 0,
    teamStats.teamPerformanceUsd ?? 0,
    state.teamPerformanceUsd ?? 0,
  );
  const totalNew = Math.max(
    teamNodes.me?.dailyNewUsd ?? 0,
    teamStats.dailyNewPerformanceUsd ?? 0,
    state.dailyNewPerformanceUsd ?? 0,
  );

  /** S1–S6 档位 = 级别：作引路人时定受贿金比例；作上线时再按层级取级差。 */
  const level = getUd3Tier(totalPerf);
  const sLevel = resolveUd3SLevel({
    totalPerfUsdt: totalPerf,
    smallAreaPerfUsdt: areas.smallAreaUsd,
  });

  const lifetimeUd3 = metrics.lifetimeUd3;
  const transferredUd3 = sumUd3Transferred(state);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`partner-elevated-card overflow-hidden ${glassCardClass('highlight', '')}`}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />

      <div className="relative px-4 pt-3.5 pb-3 border-b border-[#E0568F]/10 dark:border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {level ? (
            <PartnerLevelBadge
              label={p('ud3.levelBadge', { level: level.label, pct: level.ratePct })}
            />
          ) : (
            <PartnerLevelBadge label={p('ud3.tierNone')} />
          )}
        </div>
        {wallet && (
          <AddressBlock value={wallet} isDark={isDark} compact dense showCopy surface="inset" />
        )}
      </div>

      <div className="relative px-4 py-3.5 space-y-2.5">
        {/* S1–S2 focus: 总业绩 */}
        <div className="animate-tile-rise" style={{ ['--rise-delay']: '0ms' } as CSSProperties}>
          <div key={`${totalPerf}:${totalNew}`} className="animate-value-pop">
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
          </div>
        </div>
        {/* S3–S6 focus: 小区业绩（不展示大区） */}
        <div className="animate-tile-rise" style={{ ['--rise-delay']: '45ms' } as CSSProperties}>
          <div key={`${areas.smallAreaUsd}:${areas.smallAreaNewUsd}`} className="animate-value-pop">
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
          </div>
        </div>
        <div className="animate-tile-rise" style={{ ['--rise-delay']: '90ms' } as CSSProperties}>
          <div key={`${lifetimeUd3}:${transferredUd3}`} className="animate-value-pop">
            <PartnerDualAnimatedBar
              title={p('team.ud3Rewards')}
              totalLabel={p('team.settledShort')}
              totalValue={lifetimeUd3}
              totalDisplay={`${lifetimeUd3.toLocaleString()} UD3`}
              newLabel={p('team.transferredShort')}
              newValue={transferredUd3}
              newDisplay={`${transferredUd3.toLocaleString()} UD3`}
              isDark={isDark}
              totalAccent="#E0568F"
              newAccent="#f59e0b"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
