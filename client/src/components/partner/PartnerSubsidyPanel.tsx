import { useMemo, useState } from 'react';
import { Building2, Clock, Gift, Users } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import {
  marketSubsidyQuota,
  partnerSubsidyQuota,
  type PartnerState,
  type SubsidyApplication,
  type SubsidyStatus,
} from '@/components/partner/partnerData';
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

function SubsidyHistoryList({
  items,
  p,
  isDark,
}: {
  items: SubsidyApplication[];
  p: (key: string) => string;
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
        return (
          <div key={row.id} className="partner-depth-inset p-3 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{row.appliedAt}</span>
            </div>
            <div className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              ${row.amountUsd.toLocaleString()}
            </div>
            <div className={`text-[11px] mt-1 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>{row.purpose}</div>
            {row.paidAt && (
              <div className="text-[10px] mt-1 text-emerald-500">
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
  state,
  onPartnerSubsidy,
  onMarketSubsidy,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  onPartnerSubsidy: (amount: number, purpose: string) => boolean;
  onMarketSubsidy: (amount: number, purpose: string) => boolean;
}) {
  const p = usePartnerTranslation(lang);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  const partnerQuota = useMemo(() => partnerSubsidyQuota(state), [state]);
  const marketQuota = useMemo(() => marketSubsidyQuota(state), [state]);
  const isLeader = state.marketLeaderStatus === 'approved';

  const reset = () => {
    setAmount('');
    setPurpose('');
    setError('');
  };

  const submitPartner = () => {
    const n = Number(amount);
    if (!purpose.trim()) {
      setError(p('subsidy.err.purpose'));
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError(p('subsidy.err.amount'));
      return;
    }
    if (n > partnerQuota.remaining) {
      setError(p('subsidy.err.quota'));
      return;
    }
    if (onPartnerSubsidy(n, purpose)) {
      reset();
      setPartnerOpen(false);
    }
  };

  const submitMarket = () => {
    const n = Number(amount);
    if (!purpose.trim()) {
      setError(p('subsidy.err.purpose'));
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setError(p('subsidy.err.amount'));
      return;
    }
    if (n > marketQuota.remaining) {
      setError(p('subsidy.err.quota'));
      return;
    }
    if (onMarketSubsidy(n, purpose)) {
      reset();
      setMarketOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className={`partner-elevated-card p-5 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0 shadow-sm">
            <Building2 size={17} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {p('subsidy.partnerTitle')}
            </div>
            <div className={`text-[11px] mt-1 leading-relaxed ${isDark ? 'text-white/42' : 'text-[#160510]/45'}`}>
              {p('subsidy.partnerDesc')}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-[10px]">
          <div className="partner-depth-inset p-2.5 rounded-xl">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.quota')}</div>
            <div className="font-bold text-emerald-500 mt-0.5">${partnerQuota.remaining.toLocaleString()}</div>
          </div>
          <div className="partner-depth-inset p-2.5 rounded-xl">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.used')}</div>
            <div className="font-bold mt-0.5">${partnerQuota.reserved.toLocaleString()}</div>
          </div>
          <div className="partner-depth-inset p-2.5 rounded-xl">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.cap')}</div>
            <div className="font-bold mt-0.5">${partnerQuota.cap.toLocaleString()}</div>
          </div>
        </div>
        <GlassButton
          className="w-full !py-3 !text-xs"
          disabled={partnerQuota.remaining <= 0}
          onClick={() => {
            reset();
            setPartnerOpen(true);
          }}
        >
          <Gift size={14} className="inline mr-1.5" />
          {p('subsidy.apply')}
        </GlassButton>
        {state.partnerSubsidyApplications.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
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
              {p('subsidy.marketDesc')}
            </div>
          </div>
        </div>

        {!isLeader ? (
          <div className="partner-depth-inset p-4 rounded-xl text-center">
            <Clock size={18} className="mx-auto mb-2 text-[#E0568F]/60" />
            <div className={`text-xs ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
              {state.marketLeaderStatus === 'pending'
                ? p('subsidy.leaderPending')
                : p('subsidy.leaderNone')}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center text-[10px]">
              <div className="partner-depth-inset p-2.5 rounded-xl">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.quota')}</div>
                <div className="font-bold text-amber-500 mt-0.5">${marketQuota.remaining.toLocaleString()}</div>
              </div>
              <div className="partner-depth-inset p-2.5 rounded-xl">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.used')}</div>
                <div className="font-bold mt-0.5">${marketQuota.reserved.toLocaleString()}</div>
              </div>
              <div className="partner-depth-inset p-2.5 rounded-xl">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('subsidy.perf')}</div>
                <div className="font-bold mt-0.5">${marketQuota.basePerformance.toLocaleString()}</div>
              </div>
            </div>
            <GlassButton
              className="w-full !py-3 !text-xs"
              disabled={marketQuota.remaining <= 0}
              onClick={() => {
                reset();
                setMarketOpen(true);
              }}
            >
              <Gift size={14} className="inline mr-1.5" />
              {p('subsidy.apply')}
            </GlassButton>
            {state.marketSubsidyApplications.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="site-stat-label mb-2">{p('subsidy.history')}</div>
                <SubsidyHistoryList items={state.marketSubsidyApplications} p={p} isDark={isDark} />
              </div>
            )}
          </>
        )}
      </div>

      <PartnerModal
        open={partnerOpen}
        onClose={() => {
          setPartnerOpen(false);
          reset();
        }}
        title={p('subsidy.modal.partner')}
        isDark={isDark}
      >
        <div className="partner-depth-inset p-3 mb-4 flex justify-between text-xs rounded-xl">
          <span className={isDark ? 'text-white/50' : 'text-[#160510]/50'}>{p('subsidy.quota10')}</span>
          <span className="font-bold text-emerald-500">${partnerQuota.remaining.toLocaleString()}</span>
        </div>
        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          {p('subsidy.amountUsdt')}
        </div>
        <div className="flex items-center gap-2 partner-depth-inset px-3 py-3 mb-4 rounded-xl">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`flex-1 bg-transparent text-xl font-bold outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
          />
          <button type="button" className="text-[#E0568F] text-xs font-bold" onClick={() => setAmount(String(partnerQuota.remaining))}>
            MAX
          </button>
        </div>
        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          {p('subsidy.purpose')}
        </div>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          placeholder={p('subsidy.purposePlaceholder')}
          className={`w-full partner-depth-inset px-3 py-2.5 text-xs rounded-xl outline-none resize-none mb-4 ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510]'}`}
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <GlassButton className="w-full !py-3" onClick={submitPartner}>
          {p('subsidy.submit')}
        </GlassButton>
      </PartnerModal>

      <PartnerModal
        open={marketOpen}
        onClose={() => {
          setMarketOpen(false);
          reset();
        }}
        title={p('subsidy.modal.market')}
        isDark={isDark}
      >
        <div className="partner-depth-inset p-3 mb-4 flex justify-between text-xs rounded-xl">
          <span className={isDark ? 'text-white/50' : 'text-[#160510]/50'}>{p('subsidy.quota5')}</span>
          <span className="font-bold text-amber-500">${marketQuota.remaining.toLocaleString()}</span>
        </div>
        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          {p('subsidy.amountUsdt')}
        </div>
        <div className="flex items-center gap-2 partner-depth-inset px-3 py-3 mb-4 rounded-xl">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`flex-1 bg-transparent text-xl font-bold outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
          />
          <button type="button" className="text-[#E0568F] text-xs font-bold" onClick={() => setAmount(String(marketQuota.remaining))}>
            MAX
          </button>
        </div>
        <div className={`text-xs font-medium mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          {p('subsidy.purpose')}
        </div>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={3}
          placeholder={p('subsidy.purposePlaceholderMarket')}
          className={`w-full partner-depth-inset px-3 py-2.5 text-xs rounded-xl outline-none resize-none mb-4 ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510]'}`}
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <GlassButton className="w-full !py-3" onClick={submitMarket}>
          {p('subsidy.submit')}
        </GlassButton>
      </PartnerModal>
    </div>
  );
}
