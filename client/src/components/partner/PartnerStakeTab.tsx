import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerReferralLoading } from '@/components/partner/PartnerReferralLoading';
import { PartnerListFilters } from '@/components/partner/partnerUiKit';
import {
  formatD3Amount,
  formatDailyYieldUsdt,
  aggregateStakeOrders,
  stakeOrderDaysLeft,
  stakeOrderProgress,
  STAKE_LOCK_DAYS,
  isPrincipalStakeKind,
  getStakeExitMultiplier,
  buildStakeOrderYieldHistory,
  usdtToD3,
  type PartnerStakeOrder,
  type PartnerState,
  type StakeOrderKind,
} from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type OrderSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const YIELD_HISTORY_PAGE_SIZE = 7;

function stakeKindKey(kind: StakeOrderKind): string {
  if (kind === 'crowdfund') return 'stake.kind.crowdfund';
  if (kind === 'partner_join') return 'stake.kind.join';
  return 'stake.kind.sd3';
}

export function PartnerStakeTab({
  lang,
  isDark,
  state,
  hasReferralBound,
  referralLoading,
  onGoHome,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  hasReferralBound: boolean;
  referralLoading?: boolean;
  onGoHome?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const crowdfundOrders = useMemo(
    () => state.stakeOrders.filter((o) => isPrincipalStakeKind(o.kind) || o.kind === 'sd3'),
    [state.stakeOrders],
  );
  const stats = aggregateStakeOrders(crowdfundOrders);
  /** Split staked principal by funding source: real USDT deposits vs UD3 re-stakes. */
  const usdtStaked = useMemo(
    () =>
      crowdfundOrders
        .filter((o) => isPrincipalStakeKind(o.kind))
        .reduce((s, o) => s + o.principalUsdt, 0),
    [crowdfundOrders],
  );
  const ud3Staked = useMemo(
    () => crowdfundOrders.filter((o) => o.kind === 'sd3').reduce((s, o) => s + o.principalUsdt, 0),
    [crowdfundOrders],
  );
  const hasStake = stats.orderCount > 0;
  const [historyOrder, setHistoryOrder] = useState<PartnerStakeOrder | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<OrderSort>('date_desc');

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = crowdfundOrders.filter((o) => {
      if (dateFrom && o.startedAt < dateFrom) return false;
      if (dateTo && o.startedAt > dateTo) return false;
      if (!q) return true;
      const hay = [o.id, o.startedAt, o.unlockAt, String(o.principalUsdt), o.kind].join(' ').toLowerCase();
      return hay.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'date_asc') return a.startedAt.localeCompare(b.startedAt);
      if (sort === 'amount_desc') return b.principalUsdt - a.principalUsdt;
      if (sort === 'amount_asc') return a.principalUsdt - b.principalUsdt;
      return b.startedAt.localeCompare(a.startedAt);
    });
    return rows;
  }, [crowdfundOrders, search, dateFrom, dateTo, sort]);

  const historyRows = useMemo(() => {
    if (!historyOrder) return [];
    const settled = state.yieldSettlementsByPosition[historyOrder.id];
    if (settled?.length) return settled;
    return buildStakeOrderYieldHistory(historyOrder, []);
  }, [historyOrder, state.yieldSettlementsByPosition]);

  const historyTotal = useMemo(
    () => historyRows.reduce((s, r) => s + r.yieldUsdt, 0),
    [historyRows],
  );

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / YIELD_HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const pagedHistoryRows = useMemo(
    () =>
      historyRows.slice(
        safeHistoryPage * YIELD_HISTORY_PAGE_SIZE,
        safeHistoryPage * YIELD_HISTORY_PAGE_SIZE + YIELD_HISTORY_PAGE_SIZE,
      ),
    [historyRows, safeHistoryPage],
  );

  useEffect(() => {
    setHistoryPage(0);
  }, [historyOrder?.id]);

  const sortOptions = [
    { id: 'date_desc', label: p('filters.sortDateDesc') },
    { id: 'date_asc', label: p('filters.sortDateAsc') },
    { id: 'amount_desc', label: p('filters.sortAmountDesc') },
    { id: 'amount_asc', label: p('filters.sortAmountAsc') },
  ];

  if (referralLoading) {
    return <PartnerReferralLoading label={p('referral.checking')} isDark={isDark} className="min-h-[40vh]" />;
  }

  if (!hasReferralBound) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('referral.required')}
      </div>
    );
  }

  if (!hasStake) {
    return (
      <div className="space-y-4">
        <div className={`text-center py-12 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          <p className="text-sm mb-4">{p('stake.noStake')}</p>
          {onGoHome && (
            <GlassButton className="!px-6" onClick={onGoHome}>
              {p('stake.goHomeStake')}
            </GlassButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`partner-elevated-card p-4 ${glassCardClass('highlight', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />

        {/* Headline: 质押总资产 */}
        <div className="flex items-end justify-between gap-3 mb-3.5">
          <div className="min-w-0">
            <div className="site-stat-label">{p('stake.total')}</div>
            <div className="site-stat-value-lg site-stat-value-accent">
              ${stats.principalUsdt.toLocaleString()}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="site-stat-label">{p('stake.daily')}</div>
            <div className="site-stat-value-sm text-emerald-500">
              {formatD3Amount(usdtToD3(stats.dailyUsdtYield))} D3
            </div>
            <div className={`text-[10px] mt-0.5 tabular-nums ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
              ≈ ${formatDailyYieldUsdt(stats.dailyUsdtYield)}
            </div>
          </div>
        </div>

        {/* Funding-source split: 使用 USDT 质押 vs 使用 UD3 质押 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="partner-depth-inset p-3 rounded-xl">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8A2B57]" aria-hidden />
              <span className="site-stat-label">{p('stake.usdtStaked')}</span>
            </div>
            <div className="site-stat-value-md">${usdtStaked.toLocaleString()}</div>
          </div>
          <div className="partner-depth-inset p-3 rounded-xl">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E0568F]" aria-hidden />
              <span className="site-stat-label">{p('stake.ud3Staked')}</span>
            </div>
            <div className="site-stat-value-md text-[#E0568F]">
              {ud3Staked.toLocaleString()}
              <span className="text-xs font-semibold opacity-70 ml-1">UD3</span>
            </div>
          </div>
        </div>
      </div>

      <PartnerListFilters
        isDark={isDark}
        p={p}
        search={search}
        onSearchChange={setSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        sortLabel={p('filters.sort')}
        sortValue={sort}
        sortOptions={sortOptions}
        onSortChange={(v) => setSort(v as OrderSort)}
      />

      <div className={`text-[10px] font-semibold uppercase tracking-widest mb-1 px-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
        {p('stake.orders')} · {STAKE_LOCK_DAYS}{p('stake.daysEach')}
      </div>

      {filteredOrders.length === 0 ? (
        <div className={`text-center py-10 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {p('filters.noResults')}
        </div>
      ) : (
        filteredOrders.map((order, i) => {
          const progress = stakeOrderProgress(order);
          const daysLeft = stakeOrderDaysLeft(order);
          const paidWithUd3 = order.kind === 'sd3';
          const exitMult = getStakeExitMultiplier(order.kind);
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => setHistoryOrder(order)}
              style={{ ['--rise-delay']: `${Math.min(i, 8) * 45}ms` } as CSSProperties}
              className={`partner-elevated-card p-3.5 w-full text-left ios-glass-pressable animate-tile-rise ${glassCardClass('default', '')}`}
            >
              <span className="ios-glass-sheen pointer-events-none" aria-hidden />

              {/* Header: kind + payment chip · date */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-bold text-[#E0568F] truncate">{p(stakeKindKey(order.kind))}</span>
                  {paidWithUd3 && (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-[#E0568F] bg-[#E0568F]/12 border border-[#E0568F]/20">
                      {p('stake.paidWithUd3')}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-[10px] flex items-center gap-0.5 tabular-nums ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                  {order.startedAt}
                  <ChevronRight size={12} className="opacity-60" />
                </span>
              </div>

              {/* Principal + exit-multiplier badge */}
              <div className="flex items-end justify-between gap-2 mb-1">
                <span className={`text-xl font-extrabold leading-none tracking-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                  {paidWithUd3 ? '' : '$'}
                  {order.principalUsdt.toLocaleString()}
                  {paidWithUd3 && <span className="text-sm font-bold text-[#E0568F] ml-1">UD3</span>}
                </span>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md text-[#8A2B57] bg-[#E0568F]/12 border border-[#E0568F]/20">
                  {p('home.tagExitMult', { mult: exitMult })}
                </span>
              </div>

              {/* Daily yield */}
              <div className="flex items-center gap-1 mb-2.5">
                <span className="text-[11px] font-semibold text-emerald-500">
                  +{formatD3Amount(usdtToD3(order.dailyYieldUsdt))} D3
                </span>
                <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                  /{p('stake.perDay')} · ≈ ${formatDailyYieldUsdt(order.dailyYieldUsdt)}
                </span>
              </div>

              {/* Progress */}
              <div className="h-1.5 rounded-full overflow-hidden mb-1.5 partner-depth-inset">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #8A2B57, #E0568F)' }}
                />
              </div>
              <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                <span className="tabular-nums">
                  {progress}% · {daysLeft}{p('stake.daysLeft')} · {order.unlockAt}
                </span>
                <span className="text-[#E0568F]/80 font-medium">{p('stake.yieldHistoryTap')}</span>
              </div>
            </button>
          );
        })
      )}

      <PartnerModal
        open={historyOrder !== null}
        onClose={() => {
          setHistoryOrder(null);
          setHistoryPage(0);
        }}
        title={p('stake.yieldHistoryTitle')}
        isDark={isDark}
      >
        {historyOrder && (
          <>
            <div className={`p-3 mb-3 rounded-2xl border ${isDark ? 'bg-[#E0568F]/10 border-[#E0568F]/25' : 'bg-[#E0568F]/8 border-[#E0568F]/20'}`}>
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-widest mb-0.5 ${isDark ? 'text-[#f9a8d4]' : 'text-[#8A2B57]/70'}`}>
                    {p(stakeKindKey(historyOrder.kind))}
                  </div>
                  <div className="text-base font-bold text-[#E0568F]">
                    ${historyOrder.principalUsdt.toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{p('stake.daily')}</div>
                  <div className="text-sm font-semibold text-emerald-400">
                    {formatD3Amount(usdtToD3(historyOrder.dailyYieldUsdt))} D3
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                    ≈ ${formatDailyYieldUsdt(historyOrder.dailyYieldUsdt)}
                  </div>
                </div>
              </div>
              <div className={`text-[10px] ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                {historyOrder.startedAt} → {historyOrder.unlockAt}
              </div>
            </div>

            {historyRows.length === 0 ? (
              <div className={`text-center py-8 text-sm ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
                {p('stake.yieldHistoryEmpty')}
              </div>
            ) : (
              <div className="mb-3">
                <div
                  className={`grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-0 px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}
                >
                  <span>{p('stake.yieldHistoryDate')}</span>
                  <span className="text-right min-w-[4.5rem]">{p('stake.yieldHistoryAmount')}</span>
                  <span className="text-right min-w-[2.75rem]">{p('stake.yieldHistoryStatus')}</span>
                </div>
                <div className="space-y-1.5 min-h-[min(42dvh,19.5rem)] max-h-[min(42dvh,19.5rem)] sm:min-h-[280px] sm:max-h-[280px]">
                  {pagedHistoryRows.map((row) => (
                    <div
                      key={row.id}
                      className={`grid grid-cols-[1fr_auto_auto] gap-x-2 items-center px-2.5 py-2 rounded-xl text-xs border ${
                        row.source === 'settled'
                          ? isDark
                            ? 'bg-emerald-500/15 border-emerald-500/30'
                            : 'bg-emerald-50 border-emerald-200/80'
                          : isDark
                            ? 'bg-white/[0.06] border-white/10'
                            : 'bg-[#160510]/[0.03] border-[#160510]/10'
                      }`}
                    >
                      <span className={`font-mono text-[11px] truncate ${isDark ? 'text-white/90' : 'text-[#160510]/85'}`}>
                        {row.date}
                      </span>
                      <span
                        className={`font-semibold text-right min-w-[4.5rem] whitespace-nowrap ${
                          row.source === 'settled' ? 'text-emerald-400' : 'text-emerald-600'
                        }`}
                      >
                        +{formatD3Amount(usdtToD3(row.yieldUsdt))} D3
                      </span>
                      <span
                        className={`text-[10px] text-right min-w-[2.75rem] font-medium leading-tight ${
                          row.source === 'settled'
                            ? isDark ? 'text-emerald-300/90' : 'text-emerald-700'
                            : isDark ? 'text-amber-300/80' : 'text-amber-700'
                        }`}
                      >
                        {row.source === 'settled' ? p('stake.yieldHistorySettled') : p('stake.yieldHistoryAccrued')}
                      </span>
                    </div>
                  ))}
                </div>

                {historyPageCount > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2.5 mt-1">
                    <button
                      type="button"
                      disabled={safeHistoryPage <= 0}
                      onClick={() => setHistoryPage((n) => Math.max(0, n - 1))}
                      className={`flex items-center gap-0.5 min-h-[40px] px-2.5 rounded-xl text-[11px] font-semibold touch-manipulation disabled:opacity-35 ${
                        isDark
                          ? 'bg-white/[0.06] text-white/80 active:bg-white/10'
                          : 'bg-[#160510]/5 text-[#160510]/80 active:bg-[#160510]/10'
                      }`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <ChevronLeft size={14} />
                      {p('stake.yieldHistoryPrev')}
                    </button>
                    <span className={`text-[10px] font-medium tabular-nums ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
                      {p('stake.yieldHistoryPage', { page: safeHistoryPage + 1, total: historyPageCount })}
                    </span>
                    <button
                      type="button"
                      disabled={safeHistoryPage >= historyPageCount - 1}
                      onClick={() => setHistoryPage((n) => Math.min(historyPageCount - 1, n + 1))}
                      className={`flex items-center gap-0.5 min-h-[40px] px-2.5 rounded-xl text-[11px] font-semibold touch-manipulation disabled:opacity-35 ${
                        isDark
                          ? 'bg-white/[0.06] text-white/80 active:bg-white/10'
                          : 'bg-[#160510]/5 text-[#160510]/80 active:bg-[#160510]/10'
                      }`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      {p('stake.yieldHistoryNext')}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={`flex justify-between items-center pt-3 border-t ${isDark ? 'border-white/15' : 'border-[#160510]/12'}`}>
              <span className={`text-xs font-medium ${isDark ? 'text-white/60' : 'text-[#160510]/60'}`}>{p('stake.yieldHistoryTotal')}</span>
              <span className="text-base font-bold text-emerald-400">
                +{formatD3Amount(usdtToD3(historyTotal))} D3
              </span>
            </div>
          </>
        )}
      </PartnerModal>
    </div>
  );
}
