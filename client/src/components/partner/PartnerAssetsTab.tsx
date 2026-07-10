import { useMemo, useState } from 'react';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerSubsidyPanel } from '@/components/partner/PartnerSubsidyPanel';
import { ArrowRightLeft, Landmark, Search, Send, Zap } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import {
  buildHistoryRecords,
  computeYieldBalances,
  getSd3Quotas,
  type PartnerHistoryKind,
  type PartnerState,
} from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type Sd3Action = 'stake' | 'transfer';
type AssetsView = 'overview' | 'subsidy' | 'history';

function clampAmount(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export function PartnerAssetsTab({
  lang,
  isDark,
  state,
  onStakeSd3,
  onTransferSd3,
  onWithdrawYield,
  onPartnerSubsidy,
  onMarketSubsidy,
  yieldWithdrawing = false,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  onStakeSd3: (amount: number) => void;
  onTransferSd3: (to: string, amount: number) => void;
  onWithdrawYield: (amount: number) => Promise<boolean>;
  yieldWithdrawing?: boolean;
  onPartnerSubsidy: (amount: number, purpose: string) => boolean;
  onMarketSubsidy: (amount: number, purpose: string) => boolean;
}) {
  const p = usePartnerTranslation(lang);
  const [view, setView] = useState<AssetsView>('overview');
  const [sd3Action, setSd3Action] = useState<Sd3Action>('stake');
  const [stakeAmount, setStakeAmount] = useState('');
  const [to, setTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [histKind, setHistKind] = useState<'all' | PartnerHistoryKind>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashAmount, setFlashAmount] = useState('');

  const quotas = getSd3Quotas(state);
  const yieldBalances = useMemo(() => {
    const computed = computeYieldBalances(state.stakeOrders);
    if (state.pendingUsdtYield > 0) {
      return {
        ...computed,
        claimable: state.pendingUsdtYield,
        accruedTotal: Math.max(computed.accruedTotal, state.lifetimeUsdtYield),
      };
    }
    return computed;
  }, [state.stakeOrders, state.pendingUsdtYield, state.lifetimeUsdtYield]);
  const muted = isDark ? 'text-white/50' : 'text-[#160510]/50';

  const assetsHistory = useMemo(
    () =>
      buildHistoryRecords(state).filter(
        (row) =>
          row.kind === 'withdraw' ||
          row.kind === 'transfer' ||
          (row.kind === 'stake' && row.stakeKind === 'sd3'),
      ),
    [state],
  );

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assetsHistory.filter((row) => {
      if (histKind !== 'all' && row.kind !== histKind) return false;
      if (dateFrom && row.at < dateFrom) return false;
      if (dateTo && row.at > dateTo) return false;
      if (!q) return true;
      const hay = [row.id, row.at, String(row.amount), row.toAddress ?? '', row.toLabel ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assetsHistory, histKind, dateFrom, dateTo, search]);

  const submitStake = () => {
    const n = clampAmount(stakeAmount, quotas.stakeQuota);
    if (n > 0) {
      onStakeSd3(n);
      setStakeAmount('');
    }
  };

  const submitTransfer = () => {
    const n = clampAmount(transferAmount, quotas.transferQuota);
    if (to.trim().length >= 10 && n > 0) {
      onTransferSd3(to.trim(), n);
      setTransferAmount('');
    }
  };

  const [flashSubmitting, setFlashSubmitting] = useState(false);

  const submitFlashSwap = async () => {
    const n = clampAmount(flashAmount, yieldBalances.claimable);
    if (n <= 0 || flashSubmitting || yieldWithdrawing) return;
    setFlashSubmitting(true);
    try {
      const ok = await onWithdrawYield(n);
      if (ok) {
        setFlashAmount('');
        setFlashOpen(false);
      }
    } finally {
      setFlashSubmitting(false);
    }
  };

  if (!state.isPartner) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('assets.partnersOnly')}
      </div>
    );
  }

  const views = [
    { id: 'overview', label: p('assets.overview') },
    { id: 'subsidy', label: p('assets.subsidy') },
    { id: 'history', label: p('assets.history') },
  ];

  const sd3Tabs = [
    { id: 'stake', label: p('assets.sd3Stake') },
    { id: 'transfer', label: p('assets.sd3Transfer') },
  ];

  const histTabs = [
    { id: 'all', label: p('assets.all') },
    { id: 'withdraw', label: p('assets.withdrawHist') },
    { id: 'stake', label: p('assets.sd3StakeHist') },
    { id: 'transfer', label: p('assets.transferHist') },
  ];

  const quickStakeAmounts = [100, 500, 1000].filter((v) => v <= quotas.stakeQuota);
  const quickFlashAmounts = [10, 50, 100].filter((v) => v <= yieldBalances.claimable);

  const historyKindLabel = (kind: PartnerHistoryKind) => {
    if (kind === 'withdraw') return p('assets.withdrawHist');
    if (kind === 'transfer') return p('assets.transferHist');
    return p('assets.sd3StakeHist');
  };

  const historyKindColor = (kind: PartnerHistoryKind) => {
    if (kind === 'withdraw') return 'text-emerald-500';
    if (kind === 'transfer') return 'text-amber-500';
    return 'text-[#E0568F]';
  };

  return (
    <div className="space-y-4">
      <SectionTabBar tabs={views} active={view} onChange={(id) => setView(id as AssetsView)} isDark={isDark} />

      {view === 'overview' && (
        <>
          <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
            <div className="site-stat-label mb-3">{p('assets.assetsOverview')}</div>
            <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.totalInvest')}</div>
                <div className="font-bold text-sm mt-0.5">${yieldBalances.principalUsdt.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.accumulatedYield')}</div>
                <div className="font-bold text-sm mt-0.5 text-emerald-500">
                  ${yieldBalances.accruedTotal.toLocaleString()}
                </div>
              </div>
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.lifetimeSd3')}</div>
                <div className="font-bold text-sm mt-0.5">{state.lifetimeSd3Earned.toLocaleString()} sD3</div>
              </div>
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.newSd3')}</div>
                <div className="font-bold text-sm mt-0.5 text-[#E0568F]">
                  {state.dailySd3Earned.toLocaleString()} sD3
                </div>
              </div>
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="site-stat-label">{p('assets.flashYield')}</div>
                <div className="text-2xl font-black text-emerald-500 mt-1">
                  ${yieldBalances.claimable.toLocaleString()}
                </div>
                <div className={`text-[10px] mt-1 ${muted}`}>{p('assets.flashYieldAvailable')}</div>
              </div>
              <GlassButton
                className="!py-2.5 !px-4 flex items-center gap-1.5 shrink-0"
                disabled={yieldBalances.claimable <= 0}
                onClick={() => setFlashOpen(true)}
              >
                <Zap size={14} />
                {p('assets.flashSwap')}
              </GlassButton>
            </div>
            <div className={`text-[10px] ${muted}`}>
              {p('assets.dailyUsdt')}: ${yieldBalances.dailyUsdtYield.toFixed(2)} · {p('assets.withdrawn')}: $
              {yieldBalances.claimedYieldUsdt.toLocaleString()}
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, rgba(138,43,87,0.3), rgba(224,86,143,0.1))', color: '#E0568F' }}
              >
                sD3
              </div>
              <div>
                <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                  {p('assets.antibribe')}
                </div>
                <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
                  {p('assets.antibribeDesc')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('assets.available')}</div>
                <div className="font-bold text-[#E0568F]">{quotas.available.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('assets.staked')}</div>
                <div className="font-bold">{quotas.staked.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('assets.stakeQuota')}</div>
                <div className="font-bold text-emerald-500">{quotas.stakeQuota.toLocaleString()}</div>
              </div>
              <div className="ios-glass-inset p-3">
                <div className="site-stat-label">{p('assets.transferQuota')}</div>
                <div className="font-bold text-amber-500">{quotas.transferQuota.toLocaleString()}</div>
              </div>
            </div>

            <SectionTabBar tabs={sd3Tabs} active={sd3Action} onChange={(id) => setSd3Action(id as Sd3Action)} isDark={isDark} />

            {sd3Action === 'stake' && (
              <div className="mt-4 space-y-3">
                <div className="ios-glass-inset p-3 flex justify-between items-center text-xs">
                  <span className={muted}>{p('assets.canStake')}</span>
                  <span className="font-bold text-emerald-500">{quotas.stakeQuota.toLocaleString()} sD3</span>
                </div>
                <div>
                  <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.amount')}</div>
                  <div className="flex items-center gap-3 ios-glass-inset px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      max={quotas.stakeQuota}
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0"
                      className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
                    />
                    <span className={`text-sm shrink-0 ${muted}`}>sD3</span>
                    <button
                      type="button"
                      className="text-[#E0568F] text-xs font-bold shrink-0"
                      onClick={() => setStakeAmount(String(quotas.stakeQuota))}
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {quickStakeAmounts.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setStakeAmount(String(v))}
                      className="text-[10px] px-2.5 py-1 rounded-lg ios-glass-inset ios-glass-pressable text-[#E0568F] font-semibold"
                    >
                      +{v}
                    </button>
                  ))}
                </div>
                <GlassButton
                  className="w-full !py-3.5 flex items-center justify-center gap-2"
                  disabled={quotas.stakeQuota <= 0}
                  onClick={submitStake}
                >
                  <Landmark size={14} /> {p('assets.confirmStake')}
                </GlassButton>
              </div>
            )}

            {sd3Action === 'transfer' && (
              <div className="mt-4 space-y-3">
                <div className={`text-[11px] leading-relaxed px-3 py-2 rounded-xl ios-glass-inset ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/80'}`}>
                  {p('assets.transferHint')}
                </div>
                <div className="ios-glass-inset p-3 flex justify-between items-center text-xs">
                  <span className={muted}>{p('assets.canTransfer')}</span>
                  <span className="font-bold text-amber-500">{quotas.transferQuota.toLocaleString()} sD3</span>
                </div>
                <div>
                  <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.downline')}</div>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="0x…"
                    className={`w-full ios-glass-inset px-3 py-2.5 text-xs rounded-xl outline-none font-mono ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/25'}`}
                  />
                </div>
                <div>
                  <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.transferAmount')}</div>
                  <div className="flex items-center gap-3 ios-glass-inset px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      max={quotas.transferQuota}
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0"
                      className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
                    />
                    <span className={`text-sm shrink-0 ${muted}`}>sD3</span>
                    <button
                      type="button"
                      className="text-[#E0568F] text-xs font-bold shrink-0"
                      onClick={() => setTransferAmount(String(quotas.transferQuota))}
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <GlassButton
                  className="w-full !py-3.5 flex items-center justify-center gap-2"
                  disabled={quotas.transferQuota <= 0}
                  onClick={submitTransfer}
                >
                  <Send size={14} /> {p('assets.confirmTransfer')}
                </GlassButton>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'subsidy' && (
        <PartnerSubsidyPanel
          lang={lang}
          isDark={isDark}
          state={state}
          onPartnerSubsidy={onPartnerSubsidy}
          onMarketSubsidy={onMarketSubsidy}
        />
      )}

      {view === 'history' && (
        <>
          <SectionTabBar tabs={histTabs} active={histKind} onChange={(id) => setHistKind(id as typeof histKind)} isDark={isDark} />

          <div className={glassCardClass('default', 'p-4 space-y-2')}>
            <div className="flex items-center gap-2 ios-glass-inset px-3 py-2.5">
              <Search size={14} className={isDark ? 'text-white/50' : 'text-[#160510]/50'} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={p('assets.search')}
                className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/45'}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`ios-glass-inset px-3 py-2 text-xs rounded-xl outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`ios-glass-inset px-3 py-2 text-xs rounded-xl outline-none ${isDark ? 'text-white' : 'text-[#160510]'}`}
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredHistory.length === 0 ? (
              <div className={`text-center py-12 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                {p('assets.noRecords')}
              </div>
            ) : (
              filteredHistory.map((row) => (
                <div key={row.id} className={glassCardClass('default', 'p-4')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${historyKindColor(row.kind)}`}>
                      {historyKindLabel(row.kind)}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{row.at}</span>
                  </div>
                  <div className={`text-sm font-bold mb-2 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {row.kind === 'transfer' ? '-' : '+'}
                    {row.amount.toLocaleString()} {row.unit}
                  </div>
                  {row.kind === 'transfer' && row.toAddress && (
                    <AddressBlock
                      label={row.toLabel ?? p('assets.downline')}
                      value={row.toAddress}
                      isDark={isDark}
                      compact
                      showCopy
                    />
                  )}
                  {row.unlockAt && (
                    <div className={`text-[10px] mt-2 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                      {p('assets.unlock')}: {row.unlockAt}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      <PartnerModal
        open={flashOpen}
        onClose={() => setFlashOpen(false)}
        title={p('assets.flashSwapTitle')}
        isDark={isDark}
      >
        <p className={`text-[11px] leading-relaxed mb-4 ${muted}`}>{p('assets.flashSwapHint')}</p>
        <div className="ios-glass-inset p-3 flex justify-between items-center text-xs mb-4">
          <span className={muted}>{p('assets.flashYield')}</span>
          <span className="font-bold text-emerald-500">${yieldBalances.claimable.toLocaleString()}</span>
        </div>
        <div>
          <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.flashSwapAmount')}</div>
          <div className="flex items-center gap-3 ios-glass-inset px-3 py-3">
            <input
              type="number"
              min={0}
              max={yieldBalances.claimable}
              value={flashAmount}
              onChange={(e) => setFlashAmount(e.target.value)}
              placeholder="0"
              className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <span className={`text-sm shrink-0 ${muted}`}>USDT</span>
            <button
              type="button"
              className="text-[#E0568F] text-xs font-bold shrink-0"
              onClick={() => setFlashAmount(String(yieldBalances.claimable))}
            >
              MAX
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3 mb-5">
          {quickFlashAmounts.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFlashAmount(String(v))}
              className="text-[10px] px-2.5 py-1 rounded-lg ios-glass-inset ios-glass-pressable text-emerald-500 font-semibold"
            >
              ${v}
            </button>
          ))}
        </div>
        <GlassButton
          className="w-full !py-3.5 flex items-center justify-center gap-2"
          disabled={yieldBalances.claimable <= 0 || flashSubmitting || yieldWithdrawing}
          onClick={() => void submitFlashSwap()}
        >
          <ArrowRightLeft size={14} /> {p('assets.confirmFlashSwap')}
        </GlassButton>
      </PartnerModal>
    </div>
  );
}
