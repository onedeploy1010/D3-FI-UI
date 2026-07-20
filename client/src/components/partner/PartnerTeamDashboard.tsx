import { useMemo, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { type PartnerState } from '@/components/partner/partnerData';
import { type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { resolvePartnerUd3Metrics, sumUd3Transferred } from '@/components/partner/partnerUd3View';
import {
  resolveUd3SLevel,
  UD3_TIERS,
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

  /**
   * 统一等级 S1–S6：S1=总业绩≥100；S2-S6=小区业绩。同一等级既定引路人受贿金比例(ratePct)
   * 又定网体差额。level 取该统一等级对应的档位(含 ratePct 显示用)。
   */
  const sLevel = resolveUd3SLevel({
    totalPerfUsdt: totalPerf,
    smallAreaPerfUsdt: areas.smallAreaUsd,
  });
  const level = sLevel ? (UD3_TIERS[sLevel.id - 1] ?? null) : null;
  // S1 按总业绩考核 → 总业绩在上并强调；S2-S6 按小区业绩 → 小区在上并强调。
  const smallOnTop = Boolean(sLevel && sLevel.id >= 2);

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
        {/* 推荐人数(直推) + 团队人数(总伞下) for the current user. */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="partner-depth-inset rounded-xl px-3 py-2">
            <div className={`text-[11px] font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
              {p('team.directReferrals')}
            </div>
            <div className="mt-0.5 text-xl font-extrabold leading-none text-[#E0568F] tabular-nums">
              {(teamNodes.me?.directCount ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="partner-depth-inset rounded-xl px-3 py-2">
            <div className={`text-[11px] font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
              {p('team.teamMembers')}
            </div>
            <div className={`mt-0.5 text-xl font-extrabold leading-none tabular-nums ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {(teamNodes.me?.teamCount ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="relative px-4 py-3.5 space-y-2.5">
        {/* 考核指标在上并强调：S1 看总业绩；S2-S6 看小区业绩。顺序随等级调换。 */}
        {(() => {
          const totalBar = (
            <div key="total" className="animate-tile-rise" style={{ ['--rise-delay']: '0ms' } as CSSProperties}>
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
                featured={!smallOnTop}
                featuredHint={!smallOnTop ? p('ud3.assessBadge') : undefined}
                badge={totalNew > 0 ? p('team.unsettledBadge') : undefined}
              />
            </div>
          );
          const smallBar = (
            <div key="small" className="animate-tile-rise" style={{ ['--rise-delay']: '45ms' } as CSSProperties}>
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
                featured={smallOnTop}
                featuredHint={smallOnTop ? p('ud3.assessBadge') : undefined}
                badge={areas.smallAreaNewUsd > 0 ? p('team.unsettledBadge') : undefined}
              />
            </div>
          );
          return smallOnTop ? [smallBar, totalBar] : [totalBar, smallBar];
        })()}
        <div className="animate-tile-rise" style={{ ['--rise-delay']: '90ms' } as CSSProperties}>
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
    </motion.div>
  );
}
