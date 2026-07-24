import { useEffect, useMemo, useState } from 'react';
import { Building2, Clock, Gift, Users } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerSubsidyApplyModal } from '@/components/partner/PartnerSubsidyApplyModal';
import {
  marketSubsidyQuota,
  partnerSubsidyQuota,
  type PartnerProgramSettings,
  type PartnerState,
  type SubsidyApplication,
  type SubsidyApplicationType,
  type SubsidyStatus,
  type SubsidyQuotaView,
} from '@/components/partner/partnerData';
import type { PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { isDemoWallet } from '@/lib/demoWallet';
import type { PartnerSubsidyQuota } from '@/lib/unionApi';
import { fetchPartnerSubsidyQuota } from '@/lib/unionApi';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const STATUS_KEYS: Record<SubsidyStatus, string> = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
  paid: 'status.paid',
};

const STATUS_CLS: Record<SubsidyStatus, string> = {
  pending: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  approved: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
  rejected: 'text-red-500 bg-red-500/10 border-red-500/20',
  paid: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

function statusLabel(status: SubsidyStatus, p: (key: string) => string) {
  return { label: p(STATUS_KEYS[status]), cls: STATUS_CLS[status] };
}

function typeLabel(type: SubsidyApplicationType | undefined, p: (key: string, vars?: Record<string, string | number>) => string) {
  if (type === 'reimbursement') return p('subsidy.typeReimbursement');
  if (type === 'reserve') return p('subsidy.typeReserve');
  return '';
}

function apiQuotaToView(quota: PartnerSubsidyQuota, ratePct: number): SubsidyQuotaView {
  return {
    ratePct,
    calculablePerformanceUsd: quota.basePerformanceUsd,
    applicableCapUsd: quota.cap,
    appliedUsd: quota.reserved,
    applicableRemainingUsd: quota.remaining,
    dedupPerformanceUsd: quota.dedupPerformanceUsd ?? quota.basePerformanceUsd,
    marketDeductionUsd: quota.marketDeductionUsd,
  };
}

function QuotaStatGrid({
  quota,
  p,
  isDark,
  accentClass,
}: {
  quota: SubsidyQuotaView;
  p: (key: string, vars?: Record<string, string | number>) => string;
  isDark: boolean;
  accentClass: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 mb-4 text-center text-[11px]">
      <div className="partner-depth-inset p-2.5 rounded-xl">
        <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.calculablePerf')}</div>
        <div className={`font-bold mt-0.5 ${isDark ? 'text-white/85' : 'text-[#160510]/85'}`}>
          ${quota.calculablePerformanceUsd.toLocaleString()}
        </div>
      </div>
      <div className="partner-depth-inset p-2.5 rounded-xl">
        <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.applicableQuota')}</div>
        <div className={`font-bold mt-0.5 ${accentClass}`}>
          ${quota.applicableRemainingUsd.toLocaleString()}
        </div>
      </div>
      <div className="partner-depth-inset p-2.5 rounded-xl">
        <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.applied')}</div>
        <div className="font-bold mt-0.5">${quota.appliedUsd.toLocaleString()}</div>
      </div>
    </div>
  );
}

function SubsidyHistoryList({
  items,
  p,
  isDark,
}: {
  items: SubsidyApplication[];
  p: (key: string, vars?: Record<string, string | number>) => string;
  isDark: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className={`text-center py-8 text-xs ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
        {p('subsidy.noHistory')}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((row) => {
        const st = statusLabel(row.status, p);
        const tLabel = typeLabel(row.applicationType, p);
        return (
          <div key={row.id} className="partner-depth-inset p-3 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                {tLabel && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-white/[0.06] text-white/55' : 'bg-[#160510]/5 text-[#160510]/55'}`}>
                    {tLabel}
                  </span>
                )}
              </div>
              <span className={`text-[11px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{row.appliedAt}</span>
            </div>
            <div className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              ${row.amountUsd.toLocaleString()}
            </div>
            <div className={`text-[11px] mt-1 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>{row.purpose}</div>
            {row.paidAt && (
              <div className="text-[11px] mt-1 text-emerald-500">
                {p('subsidy.paid')}: {row.paidAt}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PartnerSubsidyPanel({
  lang,
  isDark,
  wallet,
  state,
  teamNodes,
  subsidySettings,
  onPartnerSubsidy,
  onMarketSubsidy,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  state: PartnerState;
  teamNodes: Record<string, PartnerTeamNode>;
  subsidySettings: PartnerProgramSettings;
  onPartnerSubsidy: (input: {
    amountUsd: number;
    purpose: string;
    applicationType: SubsidyApplicationType;
    receiptPaths: string[];
  }) => boolean | Promise<boolean>;
  onMarketSubsidy: (input: {
    amountUsd: number;
    purpose: string;
    applicationType: SubsidyApplicationType;
    receiptPaths: string[];
  }) => boolean | Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [apiPartnerQuota, setApiPartnerQuota] = useState<PartnerSubsidyQuota | null>(null);
  const [apiMarketQuota, setApiMarketQuota] = useState<PartnerSubsidyQuota | null>(null);

  const useApiQuota = Boolean(wallet && !isDemoWallet(wallet));

  useEffect(() => {
    if (!useApiQuota || !wallet) {
      setApiPartnerQuota(null);
      setApiMarketQuota(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [partnerRes, marketRes] = await Promise.all([
          fetchPartnerSubsidyQuota(wallet, 'partner_subsidy'),
          fetchPartnerSubsidyQuota(wallet, 'market_subsidy'),
        ]);
        if (!cancelled) {
          setApiPartnerQuota(partnerRes.quota);
          setApiMarketQuota(marketRes.quota);
        }
      } catch {
        if (!cancelled) {
          setApiPartnerQuota(null);
          setApiMarketQuota(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, useApiQuota, state.partnerSubsidyApplications.length, state.marketSubsidyApplications.length]);

  const isMarketLeaderNode = useMemo(
    () => (_nodeId: string) => false,
    [],
  );

  const localPartnerQuota = useMemo(
    () => partnerSubsidyQuota(state, subsidySettings.partnerSubsidyRatePct, teamNodes, isMarketLeaderNode),
    [state, subsidySettings.partnerSubsidyRatePct, teamNodes, isMarketLeaderNode],
  );
  const localMarketQuota = useMemo(
    () => marketSubsidyQuota(state, subsidySettings.marketSubsidyRatePct, teamNodes, isMarketLeaderNode),
    [state, subsidySettings.marketSubsidyRatePct, teamNodes, isMarketLeaderNode],
  );

  const partnerQuota = useMemo(
    () =>
      apiPartnerQuota
        ? apiQuotaToView(apiPartnerQuota, subsidySettings.partnerSubsidyRatePct)
        : localPartnerQuota,
    [apiPartnerQuota, localPartnerQuota, subsidySettings.partnerSubsidyRatePct],
  );
  const marketQuota = useMemo(
    () =>
      apiMarketQuota
        ? apiQuotaToView(apiMarketQuota, subsidySettings.marketSubsidyRatePct)
        : localMarketQuota,
    [apiMarketQuota, localMarketQuota, subsidySettings.marketSubsidyRatePct],
  );

  const isLeader = state.marketLeaderStatus === 'approved';
  // 补贴权益 = 管理后台的补贴开关: per-member override 优先, 合伙人默认取全局
  // 比例, 其他会员默认 0 (未开通)。
  const effectivePct =
    state.subsidyRatePct ?? (state.isPartner ? subsidySettings.partnerSubsidyRatePct : 0);
  const subsidyEnabled = effectivePct > 0;

  return (
    <div className="space-y-3">
      <div
        className={`partner-elevated-card px-4 py-3 ${glassCardClass('default', '')} flex items-center gap-2.5`}
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${subsidyEnabled ? 'bg-emerald-500' : 'bg-white/25'}`}
        />
        <span className={`text-xs ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>
          {subsidyEnabled
            ? p('subsidy.entitlementOn', { pct: effectivePct })
            : p('subsidy.entitlementOff')}
        </span>
      </div>
      <div className={`partner-elevated-card p-5 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0 shadow-sm">
            <Building2 size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[15px] font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {p('subsidy.partnerTitle')}
            </div>
            <div className={`text-[11px] mt-1 leading-relaxed ${isDark ? 'text-white/42' : 'text-[#160510]/45'}`}>
              {p('subsidy.partnerDesc', { pct: subsidySettings.partnerSubsidyRatePct })}
            </div>
            {(partnerQuota.marketDeductionUsd ?? 0) > 0 && (
              <div className={`text-[11px] mt-1.5 ${isDark ? 'text-amber-400/80' : 'text-amber-700/90'}`}>
                {p('subsidy.marketDeductionHint', {
                  amount: (partnerQuota.marketDeductionUsd ?? 0).toLocaleString(),
                })}
              </div>
            )}
          </div>
        </div>
        <QuotaStatGrid
          quota={partnerQuota}
          p={p}
          isDark={isDark}
          accentClass="text-emerald-500"
        />
        <GlassButton
          className="w-full !py-3 !text-xs"
          disabled={!subsidyEnabled || partnerQuota.applicableRemainingUsd <= 0}
          onClick={() => setPartnerOpen(true)}
        >
          <Gift size={14} className="inline mr-1.5" />
          {subsidyEnabled ? p('subsidy.apply') : p('subsidy.entitlementOff')}
        </GlassButton>
        {state.partnerSubsidyApplications.length > 0 && (
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/[0.06]' : 'border-[#160510]/10'}`}>
            <div className="site-stat-label mb-2">{p('subsidy.history')}</div>
            <SubsidyHistoryList items={state.partnerSubsidyApplications} p={p} isDark={isDark} />
          </div>
        )}
      </div>

      <div className={`partner-elevated-card p-5 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-500 shrink-0 shadow-sm">
            <Users size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {p('subsidy.marketTitle')}
            </div>
            <div className={`text-[11px] mt-1 leading-relaxed ${isDark ? 'text-white/42' : 'text-[#160510]/45'}`}>
              {p('subsidy.marketDesc', { pct: subsidySettings.marketSubsidyRatePct })}
            </div>
          </div>
        </div>

        {!isLeader ? (
          <div className="partner-depth-inset p-4 rounded-xl text-center">
            <Clock size={18} className="mx-auto mb-2 text-[#E0568F]/60" />
            <div className={`text-xs ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
              {state.marketLeaderStatus === 'pending' ? p('subsidy.leaderPending') : p('subsidy.leaderNone')}
            </div>
          </div>
        ) : (
          <>
            <QuotaStatGrid
              quota={marketQuota}
              p={p}
              isDark={isDark}
              accentClass={isDark ? 'text-amber-400' : 'text-[#d97706]'}
            />
            <GlassButton
              className="w-full !py-3 !text-xs"
              disabled={marketQuota.applicableRemainingUsd <= 0}
              onClick={() => setMarketOpen(true)}
            >
              <Gift size={14} className="inline mr-1.5" />
              {p('subsidy.apply')}
            </GlassButton>
            {state.marketSubsidyApplications.length > 0 && (
              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/[0.06]' : 'border-[#160510]/10'}`}>
                <div className="site-stat-label mb-2">{p('subsidy.history')}</div>
                <SubsidyHistoryList items={state.marketSubsidyApplications} p={p} isDark={isDark} />
              </div>
            )}
          </>
        )}
      </div>

      <PartnerSubsidyApplyModal
        open={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        title={p('subsidy.modal.partner')}
        lang={lang}
        isDark={isDark}
        wallet={wallet}
        ratePct={partnerQuota.ratePct}
        remainingUsd={partnerQuota.applicableRemainingUsd}
        accentClass={isDark ? 'text-emerald-400' : 'text-emerald-600'}
        purposePlaceholder={p('subsidy.purposePlaceholder')}
        onSubmit={onPartnerSubsidy}
      />

      <PartnerSubsidyApplyModal
        open={marketOpen}
        onClose={() => setMarketOpen(false)}
        title={p('subsidy.modal.market')}
        lang={lang}
        isDark={isDark}
        wallet={wallet}
        ratePct={marketQuota.ratePct}
        remainingUsd={marketQuota.applicableRemainingUsd}
        accentClass={isDark ? 'text-amber-400' : 'text-[#d97706]'}
        purposePlaceholder={p('subsidy.purposePlaceholderMarket')}
        onSubmit={onMarketSubsidy}
      />
    </div>
  );
}
