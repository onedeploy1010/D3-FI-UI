import { useState } from 'react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { PartnerTeamTree } from '@/components/partner/PartnerTeamTree';
import { partnerTeamNodes } from '@/components/partner/partnerTeamData';
import { BRIBE_TIERS, calcDailySd3, getBribeTier, type PartnerState } from '@/components/partner/partnerData';
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
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  wallet: string | null;
}) {
  const p = usePartnerTranslation(lang);
  const referralLink = buildReferralLink(wallet);
  const tier = getBribeTier(state.teamPerformanceUsd);
  const tierIdx = BRIBE_TIERS.indexOf(tier);
  const expectedSd3 = calcDailySd3(state.teamPerformanceUsd, state.dailyNewPerformanceUsd);
  const [sub, setSub] = useState<TeamSub>('overview');

  const directDownlines = partnerTeamNodes.me.childrenIds
    .map((id) => partnerTeamNodes[id])
    .filter(Boolean);

  if (!state.isPartner) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('team.partnersOnly')}
      </div>
    );
  }

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

      <SectionTabBar tabs={subs} active={sub} onChange={(id) => setSub(id as TeamSub)} isDark={isDark} />

      {sub === 'overview' && (
        <>
          <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('team.teamTotal')}</div>
                <div className="site-stat-value-lg site-stat-value-accent">${state.teamPerformanceUsd.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('team.todayNew')}</div>
                <div className="site-stat-value-lg text-emerald-500">${state.dailyNewPerformanceUsd.toLocaleString()}</div>
              </div>
            </div>
            <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {tier.ratePct}% · {p(TIER_KEYS[tierIdx])} · ≈ {expectedSd3.toLocaleString()} sD3
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5 text-center')}>
            <div className="site-stat-label">{p('team.yesterdaySd3')}</div>
            <div className="text-3xl font-black text-[#E0568F] my-1">{state.dailySd3Earned.toLocaleString()}</div>
            <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>{state.lastSettlementDate}</div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className="site-section-title mb-3">{p('team.directDownline')}</div>
            <div className="space-y-2">
              {directDownlines.map((n) => (
                <div key={n.id} className="ios-glass-inset p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{n.label}</div>
                    <div className={`text-[10px] font-mono truncate ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>{n.short}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold">${n.teamUsd.toLocaleString()}</div>
                    <div className="text-[10px] text-emerald-500">+${n.dailyNewUsd.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {sub === 'tree' && <PartnerTeamTree lang={lang} isDark={isDark} />}
    </div>
  );
}
