import { useMemo, useState } from 'react';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerSubsidyPanel } from '@/components/partner/PartnerSubsidyPanel';
import { ArrowRightLeft, Send, Zap } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { SectionTabBar } from '@/components/d3fi/SectionTabBar';
import { Search } from 'lucide-react';
import {
  buildHistoryRecords,
  calcFlashSwapAmounts,
  CROWDFUND_UNIT_PRICE_USDT,
  d3ToUsdt,
  FLASH_SWAP_FEE_PCT,
  formatD3Amount,
  getSd3Quotas,
  MIN_YIELD_WITHDRAW_USDT,
  resolveFlashYieldBalances,
  type PartnerHistoryKind,
  type PartnerProgramSettings,
  type PartnerState,
  type SubsidyApplicationType,
} from '@/components/partner/partnerData';
import { type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import { PartnerSd3Amount } from '@/components/partner/partnerUiKit';
import { resolvePartnerSd3Metrics, sumSd3Transferred } from '@/components/partner/partnerSd3View';
import type { PartnerTeamStats } from '@/lib/d3fiTypes';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type AssetsView = 'overview' | 'subsidy' | 'history';

function clampAmount(raw: string, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

export function PartnerAssetsTab({
  lang,
  isDark,
  wallet,
  state,
  teamStats,
  subsidySettings,
  teamNodes = {},
  pendingSd3Earned = 0,
  downlineWallets: _downlineWallets,
  onStakeSd3: _onStakeSd3,
  onTransferSd3: _onTransferSd3,
  onWithdrawYield,
  onPartnerSubsidy,
  onMarketSubsidy,
  onGoTeamTransferGuide,
  yieldWithdrawing = false,
  hasStake = false,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  state: PartnerState;
  hasStake?: boolean;
  teamStats: PartnerTeamStats;
  subsidySettings: PartnerProgramSettings;
  teamNodes?: Record<string, PartnerTeamNode>;
  pendingSd3Earned?: number;
  downlineWallets?: string[];
  onStakeSd3: (amount: number) => void | Promise<boolean>;
  onTransferSd3: (to: string, amount: number) => Promise<boolean>;
  onWithdrawYield: (amount: number) => Promise<boolean>;
  yieldWithdrawing?: boolean;
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
  onGoTeamTransferGuide?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const [view, setView] = useState<AssetsView>('overview');
  const [histKind, setHistKind] = useState<'all' | PartnerHistoryKind>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashAmount, setFlashAmount] = useState('');
  const quotas = getSd3Quotas(state);
  const sd3Metrics = useMemo(
    () => resolvePartnerSd3Metrics(state, teamNodes, teamStats, pendingSd3Earned),
    [state, teamNodes, teamStats, pendingSd3Earned],
  );
  const transferredSd3 = useMemo(() => sumSd3Transferred(state), [state]);
  const yieldBalances = useMemo(() => resolveFlashYieldBalances(state), [state]);
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

  const [flashSubmitting, setFlashSubmitting] = useState(false);

  const submitFlashSwap = async () => {
    const d3Amt = clampAmount(flashAmount, yieldBalances.claimableD3);
    const usdtAmt = d3ToUsdt(d3Amt, yieldBalances.d3PriceUsdt);
    if (usdtAmt < MIN_YIELD_WITHDRAW_USDT || flashSubmitting || yieldWithdrawing) return;
    setFlashSubmitting(true);
    try {
      const ok = await onWithdrawYield(usdtAmt);
      if (ok) {
        setFlashAmount('');
        setFlashOpen(false);
      }
    } finally {
      setFlashSubmitting(false);
    }
  };

  // Partners always see assets; non-partners see them too once they have staked
  // (so they can view their stake positions, yield and D3 output).
  if (!state.isPartner && !hasStake) {
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

  const histTabs = [
    { id: 'all', label: p('assets.all') },
    { id: 'withdraw', label: p('assets.withdrawHist') },
    { id: 'stake', label: p('assets.sd3StakeHist') },
    { id: 'transfer', label: p('assets.transferHist') },
  ];

  const flashD3Preview = clampAmount(flashAmount, yieldBalances.claimableD3);
  const flashGrossUsdt = d3ToUsdt(flashD3Preview, yieldBalances.d3PriceUsdt);
  const flashSplit = calcFlashSwapAmounts(flashGrossUsdt);
  const flashUsdtPreview = flashSplit.netUsdt;
  const quickFlashAmounts = [1, 5, 10, 50].filter((v) => v <= yieldBalances.claimableD3);

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
                  {formatD3Amount(yieldBalances.accruedD3)} D3
                </div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>
                  ≈ ${yieldBalances.accruedTotal.toLocaleString()}
                </div>
              </div>
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.lifetimeSd3')}</div>
                <div className="font-bold text-sm mt-0.5">
                  <PartnerSd3Amount value={sd3Metrics.lifetimeSd3} />
                </div>
              </div>
              <div className="ios-glass-inset p-2.5">
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{p('assets.newSd3')}</div>
                <div className="font-bold text-sm mt-0.5 text-[#E0568F]">
                  <PartnerSd3Amount value={transferredSd3} />
                </div>
              </div>
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="site-stat-label">{p('assets.flashYield')}</div>
                <div className="text-2xl font-black text-emerald-500 mt-1">
                  {formatD3Amount(yieldBalances.claimableD3)} D3
                </div>
                <div className={`text-sm font-bold mt-0.5 ${isDark ? 'text-white/70' : 'text-[#160510]/70'}`}>
                  ≈ ${yieldBalances.claimableUsdt.toLocaleString()}
                  <span className={`font-normal text-[10px] ml-1 ${muted}`}>
                    ({p('assets.d3PriceHint', { price: yieldBalances.d3PriceUsdt })})
                  </span>
                </div>
                <div className={`text-[10px] mt-1 ${muted}`}>
                  {p('assets.flashYieldAvailable')}
                  {!yieldBalances.canWithdraw && yieldBalances.claimableD3 > 0 && (
                    <span className="block text-amber-500/90 mt-0.5">
                      {p('assets.flashYieldMinD3', {
                        min: formatD3Amount(yieldBalances.minWithdrawD3),
                        usdt: MIN_YIELD_WITHDRAW_USDT,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <GlassButton
                className="!py-2.5 !px-4 flex items-center gap-1.5 shrink-0"
                disabled={!yieldBalances.canWithdraw}
                onClick={() => setFlashOpen(true)}
              >
                <Zap size={14} />
                {p('assets.flashSwap')}
              </GlassButton>
            </div>
            <div className={`text-[10px] ${muted}`}>
              {p('assets.dailyD3')}: {formatD3Amount(yieldBalances.dailyD3)} D3
              <span className="mx-1">·</span>
              ≈ ${yieldBalances.dailyUsdtYield.toFixed(4)}
              <span className="mx-1">·</span>
              {p('assets.withdrawn')}: {formatD3Amount(yieldBalances.claimedD3)} D3
            </div>
          </div>

          <div className={glassCardClass('default', 'p-5')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="site-stat-label">{p('assets.antibribe')}</div>
                <div className="text-2xl font-black text-[#E0568F] mt-1">
                  <PartnerSd3Amount value={quotas.transferQuota} />
                </div>
                <div className={`text-[10px] mt-1 leading-relaxed ${muted}`}>
                  {p('assets.canTransfer')}
                </div>
              </div>
              <GlassButton
                className="!py-2.5 !px-4 flex items-center gap-1.5 shrink-0"
                disabled={quotas.transferQuota <= 0}
                onClick={() => onGoTeamTransferGuide?.()}
              >
                <Send size={14} />
                {p('assets.goTransfer')}
              </GlassButton>
            </div>
          </div>
        </>
      )}

      {view === 'subsidy' && (
        <PartnerSubsidyPanel
          lang={lang}
          isDark={isDark}
          wallet={wallet}
          state={state}
          teamNodes={teamNodes ?? {}}
          subsidySettings={subsidySettings}
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
        <p className={`text-[11px] leading-relaxed mb-4 ${muted}`}>
          {p('assets.flashSwapHintD3', { pct: FLASH_SWAP_FEE_PCT })}
        </p>
        <div className={`text-[10px] mb-4 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
          {p('assets.d3PriceHint', { price: yieldBalances.d3PriceUsdt ?? CROWDFUND_UNIT_PRICE_USDT })}
        </div>
        <div className="ios-glass-inset p-3 flex justify-between items-center text-xs mb-4">
          <span className={muted}>{p('assets.flashYield')}</span>
          <span className="text-right">
            <span className="block font-bold text-emerald-500">{formatD3Amount(yieldBalances.claimableD3)} D3</span>
            <span className={muted}>≈ ${yieldBalances.claimableUsdt.toLocaleString()}</span>
          </span>
        </div>
        <div>
          <div className={`text-xs font-semibold mb-2 ${muted}`}>{p('assets.flashSwapAmountD3')}</div>
          <div className="flex items-center gap-3 ios-glass-inset px-3 py-3">
            <input
              type="number"
              min={0}
              max={yieldBalances.claimableD3}
              value={flashAmount}
              onChange={(e) => setFlashAmount(e.target.value)}
              placeholder="0"
              className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <span className={`text-sm shrink-0 ${muted}`}>D3</span>
            <button
              type="button"
              className="text-[#E0568F] text-xs font-bold shrink-0"
              onClick={() => setFlashAmount(String(yieldBalances.claimableD3))}
            >
              MAX
            </button>
          </div>
          {flashD3Preview > 0 && (
            <div className={`mt-2 space-y-1 text-[11px] text-right ${muted}`}>
              <div>
                {p('assets.flashSwapGross')}: ${flashSplit.grossUsdt.toLocaleString()} USDT
              </div>
              <div>
                {p('assets.flashSwapFee', { pct: FLASH_SWAP_FEE_PCT })}: −${flashSplit.feeUsdt.toLocaleString()} USDT
              </div>
              <div>
                {p('assets.flashSwapReceive')}:{' '}
                <span className="font-bold text-emerald-500">${flashUsdtPreview.toLocaleString()}</span> USDT
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap mt-3 mb-5">
          {quickFlashAmounts.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setFlashAmount(String(v))}
              className="text-[10px] px-2.5 py-1 rounded-lg ios-glass-inset ios-glass-pressable text-emerald-500 font-semibold"
            >
              {v} D3
            </button>
          ))}
        </div>
        <GlassButton
          className="w-full !py-3.5 flex items-center justify-center gap-2"
          disabled={!yieldBalances.canWithdraw || flashSubmitting || yieldWithdrawing}
          onClick={() => void submitFlashSwap()}
        >
          <ArrowRightLeft size={14} /> {p('assets.confirmFlashSwap')}
        </GlassButton>
      </PartnerModal>
    </div>
  );
}
