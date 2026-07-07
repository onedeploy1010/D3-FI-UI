import { useMemo, useState } from 'react';
import { glassCardClass, GlassButton, GlassIconButton } from '@/components/ui/GlassSurface';
import { Gift, Zap, Coins, RefreshCw, HelpCircle, Search, ArrowUpDown, CalendarDays, Vote, Shield, Crown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RulesSheet, type RuleTopic } from '@/components/d3fi/RulesSheet';

type Lang = 'zh' | 'en';
export type EarnSub = 'overview' | 'breakdown' | 'history';

type BreakdownCategory = 'all' | 'bribe' | 'lp' | 'emission' | 'dt';
type BreakdownItem = {
  id: string;
  epoch: string;
  date: string;
  category: Exclude<BreakdownCategory, 'all'>;
  sourceZh: string;
  sourceEn: string;
  asset: 'USDT' | 'D3';
  amount: number;
  status: 'claimable' | 'pending';
};

type HistoryItem = {
  id: string;
  date: string;
  epoch: string;
  usdt: number;
};

const EMISSION_SEGMENTS = [
  { pct: 65, color: '#C9A96E', icon: Vote, labelZh: 'Gauge 投票者', labelEn: 'Gauge voters' },
  { pct: 15, color: '#9B2D5A', icon: Shield, labelZh: 'veD3 底薪', labelEn: 'veD3 base', subZh: '锁仓 ≥180 天', subEn: 'lock ≥180d' },
  { pct: 10, color: '#6B1A3A', icon: Crown, labelZh: 'DT Top5', labelEn: 'DT Top5', subZh: '持仓排名前五', subEn: 'top 5 holders' },
  { pct: 10, color: '#22c55e', icon: ShieldCheck, labelZh: '守护池', labelEn: 'Guardian pool', subZh: '协议安全与回购', subEn: 'security & buyback' },
] as const;

const BREAKDOWN_ICONS = { bribe: Gift, lp: RefreshCw, emission: Zap, dt: Coins } as const;

function EmissionSplitVisual({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';

  return (
    <div>
      <div className={`h-2.5 rounded-full overflow-hidden flex ${isDark ? 'ring-1 ring-white/[0.06]' : 'ring-1 ring-[#6B1A3A]/[0.06]'}`}>
        {EMISSION_SEGMENTS.map((seg) => (
          <div
            key={seg.labelEn}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
          />
        ))}
      </div>
      <div className="mt-4 space-y-1">
        {EMISSION_SEGMENTS.map((seg) => {
          const Icon = seg.icon;
          return (
            <div
              key={seg.labelEn}
              className={`flex items-center gap-3 py-2.5 px-1 border-b last:border-0 ${isDark ? 'border-white/[0.04]' : 'border-[#6B1A3A]/[0.05]'}`}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${seg.color}18` }}>
                <Icon size={15} style={{ color: seg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? seg.labelZh : seg.labelEn}</div>
                <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>{t ? seg.subZh : seg.subEn}</div>
              </div>
              <div className="text-sm font-bold font-heading shrink-0" style={{ color: seg.color }}>{seg.pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListToolbar({
  lang,
  isDark,
  q,
  onQ,
  range,
  onRange,
  sort,
  onSort,
  searchPlaceholder,
  sortLabels,
}: {
  lang: Lang;
  isDark: boolean;
  q: string;
  onQ: (v: string) => void;
  range: '7d' | '30d' | 'all';
  onRange: (v: '7d' | '30d' | 'all') => void;
  sort: string;
  onSort: () => void;
  searchPlaceholder: string;
  sortLabels: [string, string, string];
}) {
  const t = lang === 'zh';

  return (
    <>
      <div className="ios-glass-inset p-3 mb-3">
        <div className="flex items-center gap-2">
          <Search size={14} className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'} />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={searchPlaceholder}
            className={`w-full bg-transparent outline-none text-xs ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#2C2824] placeholder:text-[#2C2824]/25'}`}
          />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        {(['7d', '30d', 'all'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRange(r)}
            className={cn('flex-1 ios-glass-inset py-2 text-[10px] font-semibold ios-glass-pressable', range === r && 'ring-1 ring-[#C9A96E]/20')}
          >
            {r !== 'all' ? (
              <>
                <CalendarDays size={12} className="inline mr-1 text-[#C9A96E]" />
                {r.toUpperCase()}
              </>
            ) : (
              t ? '全部' : 'All'
            )}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSort} className="w-full ios-glass-inset p-3 text-left ios-glass-pressable">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '排序' : 'Sort'}</span>
          <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
            <ArrowUpDown size={12} className="inline mr-1 text-[#C9A96E]" />
            {sortLabels[0]}
          </span>
        </div>
      </button>
    </>
  );
}

function inDateRange(date: string, range: '7d' | '30d' | 'all') {
  if (range === 'all') return true;
  const d = new Date(date);
  const now = new Date('2026-07-07');
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

export function DividendsTabContent({
  lang,
  isDark,
  earnSub,
  onNavigateSub,
}: {
  lang: Lang;
  isDark: boolean;
  earnSub: EarnSub;
  onNavigateSub: (sub: EarnSub) => void;
}) {
  const t = lang === 'zh';
  const stakingRate = 62.4;
  const poolPhase = 'growth' as 'growth' | 'sustain';
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesTopic, setRulesTopic] = useState<RuleTopic>('general');

  const epoch = '#42';
  const bribePoolTotal = '$2.4M';
  const bribePoolDistributableD3 = '180,000 D3';
  const myDt = 120;
  const totalDt = 12_450;
  const myDtRate = useMemo(() => (myDt / totalDt) * 100, [myDt, totalDt]);
  const distributableUsdtNum = 180_000;
  const estimatedDtUsdt = useMemo(() => Math.round((myDt / totalDt) * distributableUsdtNum * 0.01), [myDt, totalDt]);
  const myVeD3 = 800;
  const estimatedVoteUsd = 400.5;

  const claimable = {
    usdt: 420.5,
  };

  const breakdownItems = useMemo<BreakdownItem[]>(
    () => [
      { id: 'b1', epoch: '#42', date: '2026-07-05', category: 'bribe', sourceZh: '贿赂池分成 (veD3)', sourceEn: 'Bribe share (veD3)', asset: 'USDT', amount: 280.3, status: 'claimable' },
      { id: 'b2', epoch: '#42', date: '2026-07-05', category: 'lp', sourceZh: 'LP 手续费 (100%)', sourceEn: 'LP fees (100%)', asset: 'USDT', amount: 85.2, status: 'claimable' },
      { id: 'b3', epoch: '#42', date: '2026-07-05', category: 'emission', sourceZh: 'Gauge 排放分红', sourceEn: 'Gauge emission dividend', asset: 'USDT', amount: 28, status: 'claimable' },
      { id: 'b4', epoch: '#42', date: '2026-07-05', category: 'dt', sourceZh: 'DT 权重分红', sourceEn: 'DT weight dividend', asset: 'USDT', amount: 27, status: 'claimable' },
      { id: 'b5', epoch: '#42', date: '2026-07-04', category: 'bribe', sourceZh: 'Alpha 协议 · 贿赂', sourceEn: 'Project Alpha · bribe', asset: 'USDT', amount: 42.1, status: 'pending' },
    ],
    [],
  );

  const historyItems = useMemo<HistoryItem[]>(
    () => [
      { id: 'h1', date: '2026-07-05', epoch: '#41', usdt: 340.2 },
      { id: 'h2', date: '2026-06-28', epoch: '#40', usdt: 285.6 },
      { id: 'h3', date: '2026-06-21', epoch: '#39', usdt: 310.8 },
      { id: 'h4', date: '2026-06-14', epoch: '#38', usdt: 298.1 },
      { id: 'h5', date: '2026-06-07', epoch: '#37', usdt: 265.4 },
    ],
    [],
  );

  const [breakdownQ, setBreakdownQ] = useState('');
  const [breakdownRange, setBreakdownRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [breakdownSort, setBreakdownSort] = useState<'newest' | 'amountDesc' | 'amountAsc'>('newest');
  const [breakdownFilter, setBreakdownFilter] = useState<BreakdownCategory>('all');

  const [historyQ, setHistoryQ] = useState('');
  const [historyRange, setHistoryRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [historySort, setHistorySort] = useState<'newest' | 'amountDesc' | 'amountAsc'>('newest');

  const filteredBreakdown = useMemo(() => {
    let rows = breakdownItems.filter((item) => {
      if (breakdownFilter !== 'all' && item.category !== breakdownFilter) return false;
      if (!inDateRange(item.date, breakdownRange)) return false;
      if (!breakdownQ.trim()) return true;
      const s = breakdownQ.trim().toLowerCase();
      return (
        item.date.includes(s) ||
        item.epoch.toLowerCase().includes(s) ||
        (t ? item.sourceZh : item.sourceEn).toLowerCase().includes(s)
      );
    });
    if (breakdownSort === 'newest') rows = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
    else if (breakdownSort === 'amountDesc') rows = [...rows].sort((a, b) => b.amount - a.amount);
    else rows = [...rows].sort((a, b) => a.amount - b.amount);
    return rows;
  }, [breakdownItems, breakdownFilter, breakdownRange, breakdownQ, breakdownSort, t]);

  const filteredHistory = useMemo(() => {
    let rows = historyItems.filter((item) => {
      if (!inDateRange(item.date, historyRange)) return false;
      if (!historyQ.trim()) return true;
      return item.date.includes(historyQ.trim()) || item.epoch.toLowerCase().includes(historyQ.trim().toLowerCase());
    });
    if (historySort === 'newest') rows = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1));
    else if (historySort === 'amountDesc') rows = [...rows].sort((a, b) => b.usdt - a.usdt);
    else rows = [...rows].sort((a, b) => a.usdt - b.usdt);
    return rows;
  }, [historyItems, historyRange, historyQ, historySort]);

  const breakdownSortLabels: [string, string, string] = breakdownSort === 'newest'
    ? [t ? '最新' : 'Newest', t ? '金额↓' : 'Amount↓', t ? '金额↑' : 'Amount↑']
    : breakdownSort === 'amountDesc'
      ? [t ? '金额↓' : 'Amount↓', t ? '金额↑' : 'Amount↑', t ? '最新' : 'Newest']
      : [t ? '金额↑' : 'Amount↑', t ? '最新' : 'Newest', t ? '金额↓' : 'Amount↓'];

  const historySortLabels: [string, string, string] = historySort === 'newest'
    ? [t ? '最新' : 'Newest', t ? '金额↓' : 'Amount↓', t ? '金额↑' : 'Amount↑']
    : historySort === 'amountDesc'
      ? [t ? '金额↓' : 'Amount↓', t ? '金额↑' : 'Amount↑', t ? '最新' : 'Newest']
      : [t ? '金额↑' : 'Amount↑', t ? '最新' : 'Newest', t ? '金额↓' : 'Amount↓'];

  const openRules = (topic: RuleTopic) => {
    setRulesTopic(topic);
    setRulesOpen(true);
  };

  if (earnSub === 'breakdown') {
    const categoryChips: { id: BreakdownCategory; label: string }[] = [
      { id: 'all', label: t ? '全部' : 'All' },
      { id: 'bribe', label: t ? '贿赂' : 'Bribe' },
      { id: 'lp', label: 'LP' },
      { id: 'emission', label: t ? '排放' : 'Emission' },
      { id: 'dt', label: 'DT' },
    ];

    return (
      <div className="space-y-4">
        <div className={glassCardClass('default', 'p-4 sm:p-5')}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className={`text-[10px] font-semibold tracking-wider uppercase ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
                Epoch {epoch}
              </div>
              <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? '本期收益明细' : 'Epoch Reward Breakdown'}</div>
            </div>
            <GlassIconButton onClick={() => openRules('weightDividends')} aria-label="Open rules">
              <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
            </GlassIconButton>
          </div>

          <div className="ios-glass-tab-bar flex gap-1 mb-3 overflow-x-auto">
            {categoryChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setBreakdownFilter(chip.id)}
                className={cn(
                  'relative shrink-0 px-3 py-2 rounded-xl text-[10px] font-semibold ios-glass-pressable',
                  breakdownFilter === chip.id ? (isDark ? 'text-white' : 'text-[#6B1A3A]') : (isDark ? 'text-white/40' : 'text-[#2C2824]/40'),
                )}
              >
                {breakdownFilter === chip.id && <span className="ios-glass-tab-active absolute inset-0" />}
                <span className="relative z-10">{chip.label}</span>
              </button>
            ))}
          </div>

          <ListToolbar
            lang={lang}
            isDark={isDark}
            q={breakdownQ}
            onQ={setBreakdownQ}
            range={breakdownRange}
            onRange={setBreakdownRange}
            sort={breakdownSort}
            onSort={() => setBreakdownSort(breakdownSort === 'newest' ? 'amountDesc' : breakdownSort === 'amountDesc' ? 'amountAsc' : 'newest')}
            searchPlaceholder={t ? '搜索来源、Epoch、日期' : 'Search source, epoch, date'}
            sortLabels={breakdownSortLabels}
          />

          <div className="mt-4 space-y-2">
            {filteredBreakdown.map((item) => {
              const Icon = BREAKDOWN_ICONS[item.category];
              return (
                <div key={item.id} className="ios-glass-inset p-3 flex items-center gap-3">
                  <div className="ios-glass-inset w-9 h-9 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-[#C9A96E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium truncate ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
                      {t ? item.sourceZh : item.sourceEn}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
                      {item.epoch} · {item.date}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-emerald-500">
                      {item.asset === 'USDT' ? `$${item.amount.toFixed(2)}` : `${item.amount} D3`}
                    </div>
                    <div className={`text-[9px] mt-0.5 ${item.status === 'claimable' ? 'text-emerald-500/70' : isDark ? 'text-white/25' : 'text-[#2C2824]/25'}`}>
                      {item.status === 'claimable' ? (t ? '可领取' : 'Claimable') : (t ? '待结算' : 'Pending')}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredBreakdown.length === 0 && (
              <div className={`text-center py-8 text-xs ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
                {t ? '暂无匹配明细' : 'No matching items'}
              </div>
            )}
          </div>
        </div>
        <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} lang={lang} isDark={isDark} topic={rulesTopic} />
      </div>
    );
  }

  if (earnSub === 'history') {
    return (
      <div className="space-y-4">
        <div className={glassCardClass('default', 'p-4 sm:p-5')}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className={`text-[10px] font-semibold tracking-wider uppercase ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
                {t ? '列表' : 'List'}
              </div>
              <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? '领取历史' : 'Claim History'}</div>
            </div>
            <GlassIconButton onClick={() => openRules('claim')} aria-label="Open rules">
              <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
            </GlassIconButton>
          </div>

          <ListToolbar
            lang={lang}
            isDark={isDark}
            q={historyQ}
            onQ={setHistoryQ}
            range={historyRange}
            onRange={setHistoryRange}
            sort={historySort}
            onSort={() => setHistorySort(historySort === 'newest' ? 'amountDesc' : historySort === 'amountDesc' ? 'amountAsc' : 'newest')}
            searchPlaceholder={t ? '搜索日期、Epoch' : 'Search date, epoch'}
            sortLabels={historySortLabels}
          />

          <div className="mt-4 space-y-2">
            {filteredHistory.map((item) => (
              <div key={item.id} className="ios-glass-inset p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{item.date}</div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
                      Epoch {item.epoch} · {t ? '已领取' : 'Claimed'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-500">${item.usdt.toFixed(2)}</div>
                    <div className={`text-[9px] ${isDark ? 'text-white/25' : 'text-[#2C2824]/25'}`}>USDT</div>
                  </div>
                </div>
                <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>
                  {t ? '已领取至钱包' : 'Claimed to wallet'}
                </div>
              </div>
            ))}
            {filteredHistory.length === 0 && (
              <div className={`text-center py-8 text-xs ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
                {t ? '暂无领取记录' : 'No claim records'}
              </div>
            )}
          </div>
        </div>
        <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} lang={lang} isDark={isDark} topic={rulesTopic} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={glassCardClass('green', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className={`text-xs ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>{t ? '待领取收益' : 'Claimable Rewards'}</div>
          <GlassIconButton onClick={() => openRules('claim')} aria-label="Open claim rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
          </GlassIconButton>
        </div>
        <div className="text-3xl font-bold text-emerald-500 font-heading">${claimable.usdt.toFixed(2)}</div>
        <div className={`text-[10px] mt-1 mb-4 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
          {t ? '治理分红 · USDT 直接领取到钱包' : 'Governance dividends · USDT claimed directly to wallet'}
        </div>

        <div className={`rounded-xl p-4 mb-2 ${isDark ? 'bg-white/[0.03]' : 'bg-[#6B1A3A]/[0.03]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-bold">USDT</span>
                <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '贿赂 + LP + 权重分红' : 'Bribes + LP + weight share'}</span>
              </div>
              <div className={`text-2xl font-bold font-heading ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
                {claimable.usdt.toFixed(2)}
              </div>
            </div>
            <GlassButton variant="success" className="!py-2.5 !px-4 !text-xs shrink-0">
              {t ? '领取至钱包' : 'Claim to Wallet'}
            </GlassButton>
          </div>
        </div>

        <div className={`text-[10px] mb-2 px-1 ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
          {t ? '推荐奖励为 dUSD，用于质押投资，请在「我的 → 推荐」或「资产 → dUSD」入账' : 'Referral rewards are dUSD for staking — credit on Me → Refer or Assets → dUSD'}
        </div>

        <button
          type="button"
          onClick={() => onNavigateSub('breakdown')}
          className={`w-full text-[10px] font-semibold ios-glass-pressable py-2 ${isDark ? 'text-[#C9A96E]/80' : 'text-[#6B1A3A]/75'}`}
        >
          {t ? '查看收益明细 →' : 'View breakdown →'}
        </button>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '全网质押率与日化收益' : 'Staking Rate & Daily Yield'}
          </div>
          <GlassIconButton onClick={() => openRules('stakingRate')} aria-label="Open staking rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
          </GlassIconButton>
        </div>
        <div className="ios-glass-inset p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>{t ? '当前全网质押率' : 'Network Staking Rate'}</span>
            <span className={`text-sm font-bold ${isDark ? 'text-[#C9A96E]' : 'text-[#6B1A3A]'}`}>{stakingRate}%</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#6B1A3A]/[0.06]'}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#6B1A3A] to-[#C9A96E]" style={{ width: `${stakingRate}%` }} />
          </div>
          <div className={`text-[10px] mt-2 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
            {t ? '质押池' : 'Pool'}: 5.2M / 6.3M D3 · {poolPhase === 'growth' ? (t ? '增长期' : 'Growth') : (t ? '可持续期' : 'Sustain')}
          </div>
        </div>
        <div className="space-y-2 text-[11px]">
          <div className={`p-3 rounded-xl ${poolPhase === 'growth' ? 'ring-1 ring-[#C9A96E]/20' : ''} ${isDark ? 'bg-white/[0.02]' : 'bg-[#6B1A3A]/[0.02]'}`}>
            <div className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? '增长期（池 > 6.3M）' : 'Growth (pool > 6.3M)'}</div>
            <p className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
              {t ? '质押率越高 → 日化收益越高' : 'Higher stake rate → higher daily yield'}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-white/[0.02]' : 'bg-[#6B1A3A]/[0.02]'}`}>
            <div className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? '可持续期（池 ≤ 6.3M）' : 'Sustain (pool ≤ 6.3M)'}</div>
            <p className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
              {t ? '质押率越高 → 日化收益越低（保护池寿命）' : 'Higher stake rate → lower daily yield'}
            </p>
          </div>
        </div>
      </div>

      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A96E]/40 to-transparent" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className={`text-[10px] font-semibold tracking-wider uppercase ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>Epoch {epoch}</div>
            <div className={`text-xs font-bold mt-0.5 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{t ? '当期贿赂池' : 'Current Bribe Pool'}</div>
          </div>
          <GlassIconButton onClick={() => openRules('bribePool')} aria-label="Open bribe pool rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
          </GlassIconButton>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-bold font-heading" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>{bribePoolTotal}</div>
            <div className={`text-[10px] mt-1 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? 'USDT 贿赂总额' : 'Total USDT bribes'}</div>
          </div>
          <div className="text-right">
            <div className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{bribePoolDistributableD3}</div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '可分配 D3' : 'Distributable D3'}</div>
          </div>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '我的权重收益' : 'My Weight Rewards'}
          </div>
          <GlassIconButton onClick={() => openRules('weightDividends')} aria-label="Open dividend rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
          </GlassIconButton>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="ios-glass-inset p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-30" style={{ background: '#6B1A3A' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="ios-glass-inset w-8 h-8 flex items-center justify-center">
                  <Coins size={14} className="text-[#6B1A3A]" />
                </div>
                <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>DT {t ? '权重分红' : 'Weight Share'}</span>
              </div>
              <div className="text-2xl font-bold font-heading text-emerald-500">${estimatedDtUsdt.toLocaleString()}</div>
              <div className={`text-[10px] mt-1 mb-3 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '本期预估 USDT' : 'Epoch USDT estimate'}</div>
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'}>{t ? '我的权重分红率' : 'Your weight rate'}</span>
                <span className={`font-bold ${isDark ? 'text-[#C9A96E]' : 'text-[#6B1A3A]'}`}>{myDtRate.toFixed(2)}%</span>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#6B1A3A]/[0.06]'}`}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#6B1A3A] to-[#C9A96E]" style={{ width: `${Math.min(100, myDtRate * 10)}%` }} />
              </div>
              <div className={`flex justify-between mt-2 text-[10px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
                <span>{t ? '我的 DT' : 'My DT'}: {myDt}</span>
                <span>{t ? '全网' : 'Total'}: {totalDt.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="ios-glass-inset p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-30" style={{ background: '#C9A96E' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="ios-glass-inset w-8 h-8 flex items-center justify-center">
                  <Vote size={14} className="text-[#C9A96E]" />
                </div>
                <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>veD3 {t ? '投票收益' : 'Voting Rewards'}</span>
              </div>
              <div className="text-2xl font-bold font-heading text-emerald-500">${estimatedVoteUsd.toFixed(2)}</div>
              <div className={`text-[10px] mt-1 mb-3 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '贿赂 + 排放 + LP 费' : 'Bribe + emission + LP fees'}</div>
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'}>{t ? '已投 veD3' : 'Allocated veD3'}</span>
                <span className={`font-bold ${isDark ? 'text-[#C9A96E]' : 'text-[#6B1A3A]'}`}>{myVeD3.toLocaleString()}</span>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#6B1A3A]/[0.06]'}`}>
                <div className="h-full rounded-full bg-[#C9A96E]" style={{ width: '33%' }} />
              </div>
              <div className={`flex justify-between mt-2 text-[10px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
                <span>{t ? '已投项目' : 'Projects'}: 1</span>
                <span>{t ? '剩余' : 'Remaining'}: 1,600 veD3</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>{t ? 'D3 排放分配' : 'D3 Emission Split'}</div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
              {t ? '每期排放按权重流向四类参与者' : 'Each epoch splits emissions across four buckets'}
            </div>
          </div>
          <GlassIconButton onClick={() => openRules('weightDividends')} aria-label="Open emission rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
          </GlassIconButton>
        </div>
        <EmissionSplitVisual lang={lang} isDark={isDark} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigateSub('breakdown')}
          className={cn(glassCardClass('default', 'p-4 text-left ios-glass-pressable'))}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
            {t ? '收益明细' : 'Breakdown'}
          </div>
          <div className={`text-sm font-bold mt-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{breakdownItems.length} {t ? '条' : 'items'}</div>
        </button>
        <button
          type="button"
          onClick={() => onNavigateSub('history')}
          className={cn(glassCardClass('default', 'p-4 text-left ios-glass-pressable'))}
        >
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
            {t ? '领取历史' : 'History'}
          </div>
          <div className={`text-sm font-bold mt-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{historyItems.length} {t ? '笔' : 'claims'}</div>
        </button>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} lang={lang} isDark={isDark} topic={rulesTopic} />
    </div>
  );
}
