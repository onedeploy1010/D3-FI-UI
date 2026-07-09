import { glassCardClass } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import type { PocScoreView } from '@/lib/d3fiTypes';

type Lang = 'zh' | 'en';

const EMPTY_POC: PocScoreView = {
  compositeScore: 0,
  levelDiffRate: 0,
  levelLabel: 'V0',
  epochLabel: '—',
  diffFloorPct: 16,
  diffCeilPct: 38,
  dimensions: [
    { key: 'H', weight: 0.15, labelZh: '个人质押', labelEn: 'Personal Stake', value: 0, rawZh: '—', rawEn: '—' },
    { key: 'C', weight: 0.15, labelZh: '团队业绩', labelEn: 'Team Performance', value: 0, rawZh: '—', rawEn: '—' },
    { key: 'A', weight: 0.30, labelZh: '团队新增', labelEn: 'Team New Deposits', value: 0, rawZh: '—', rawEn: '—' },
    { key: 'R', weight: 0.30, labelZh: '留存率', labelEn: 'Retention', value: 0, rawZh: '—', rawEn: '—' },
    { key: 'E', weight: 0.10, labelZh: '有效账户', labelEn: 'Valid Accounts', value: 0, rawZh: '—', rawEn: '—' },
  ],
  settledAt: null,
  updatedAt: null,
};

export function PocScoreTab({
  lang,
  isDark,
  poc,
  isLoading,
}: {
  lang: Lang;
  isDark: boolean;
  poc?: PocScoreView | null;
  isLoading?: boolean;
}) {
  const t = lang === 'zh';
  const data = poc ?? EMPTY_POC;
  const score = data.compositeScore;
  const displayLevel = data.levelLabel;
  const epoch = data.epochLabel;

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className={`text-xs mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>PoC {t ? '综合分' : 'Score'}</div>
        <div className="flex items-end gap-3">
          <div className="text-4xl font-bold font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>
            {isLoading ? '…' : score.toFixed(1)}
          </div>
          <div className={`text-sm pb-1 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>/ 100</div>
        </div>
        <div className={`h-2 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#8A2B57] to-[#E0568F]" style={{ width: `${Math.min(100, score)}%` }} />
        </div>
        <div className={`text-[10px] mt-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
          {isLoading
            ? (t ? '加载中…' : 'Loading…')
            : t
              ? `当前等级 ${displayLevel} · Epoch ${epoch} 结算更新`
              : `Level ${displayLevel} · Updated at Epoch ${epoch}`}
        </div>
        {data.settledAt && !isLoading && (
          <div className={`text-[10px] mt-1 ${isDark ? 'text-white/25' : 'text-[#160510]/25'}`}>
            {t ? `上次结算：${data.settledAt.slice(0, 10)}` : `Last settled: ${data.settledAt.slice(0, 10)}`}
          </div>
        )}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? 'PoC 计算公式' : 'PoC Formula'}
        </div>
        <code className={`block text-[11px] leading-relaxed p-3 rounded-xl ios-glass-inset ${isDark ? 'text-[#E0568F]/85' : 'text-[#8A2B57]/85'}`}>
          PoC = 0.15H + 0.15C + 0.30A + 0.30R + 0.10E
        </code>
        <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
          {t
            ? 'H=个人质押 C=团队业绩 A=团队新增 R=留存率 E=有效账户。各维度满分 100，加权求和。'
            : 'H=personal stake, C=team perf, A=new deposits, R=retention, E=valid accounts. Each 0–100, weighted sum.'}
        </p>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '五维得分明细' : 'Dimension Breakdown'}
        </div>
        <div className="space-y-3">
          {data.dimensions.map((dim) => (
            <div key={dim.key} className="ios-glass-inset p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{dim.key}</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? dim.labelZh : dim.labelEn}</span>
                  <span className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>×{(dim.weight * 100).toFixed(0)}%</span>
                </div>
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                  {isLoading ? '…' : dim.value}
                </span>
              </div>
              <div className={`h-1 rounded-full overflow-hidden mb-1.5 ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
                <div className="h-full rounded-full bg-[#E0568F]/70" style={{ width: `${dim.value}%` }} />
              </div>
              <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? dim.rawZh : dim.rawEn}</div>
              <div className={`text-[9px] mt-0.5 ${isDark ? 'text-white/25' : 'text-[#160510]/25'}`}>
                {t ? '加权贡献' : 'Weighted'}: {(dim.value * dim.weight).toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '级差收益计算' : 'Level-Diff Reward'}
        </div>
        <code className={`block text-[10px] leading-relaxed p-3 rounded-xl ios-glass-inset mb-3 ${isDark ? 'text-[#E0568F]/85' : 'text-[#8A2B57]/85'}`}>
          {t
            ? '实际级差 = 下限 + (上限 − 下限) × (PoC ÷ 100)'
            : 'Actual diff = floor + (ceil − floor) × (PoC ÷ 100)'}
        </code>
        <div className="ios-glass-inset p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={isDark ? 'text-white/50' : 'text-[#160510]/50'}>
              {t ? `你的 ${displayLevel} 级差范围` : `Your ${displayLevel} diff range`}
            </span>
            <span className={isDark ? 'text-white/70' : 'text-[#160510]/70'}>
              {data.diffFloorPct}% – {data.diffCeilPct}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? '当前实际级差' : 'Current diff rate'}</span>
            <span className="text-xl font-bold text-emerald-500">{isLoading ? '…' : `${data.levelDiffRate}%`}</span>
          </div>
          <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
            = {data.diffFloorPct}% + ({data.diffCeilPct}% − {data.diffFloorPct}%) × ({score.toFixed(1)} ÷ 100) ≈ {data.levelDiffRate}%
          </p>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          PoN {t ? '算力奖励' : 'Hashpower Reward'}
        </div>
        <code className={cn('block text-[10px] leading-relaxed', isDark ? 'text-white/45' : 'text-[#160510]/45')}>
          {t
            ? 'PoN = (个人小区算力 ÷ 全网算力) × 递减系数 × PoN池'
            : 'PoN = (your small-area power ÷ network) × decay × PoN pool'}
        </code>
        <p className={`text-[10px] mt-2 ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>
          {t ? '层递减：100% → 98% → … → 10% 保底' : 'Layer decay: 100% → 98% → … → 10% floor'}
        </p>
      </div>
    </div>
  );
}
