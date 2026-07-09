import { glassCardClass } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import { levelDiffRate, pocDimensions, pocScore } from './protocolData';

type Lang = 'zh' | 'en';

export function PocScoreTab({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className={`text-xs mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>PoC {t ? '综合分' : 'Score'}</div>
        <div className="flex items-end gap-3">
          <div className="text-4xl font-bold font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{pocScore}</div>
          <div className={`text-sm pb-1 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>/ 100</div>
        </div>
        <div className={`h-2 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#8A2B57] to-[#E0568F]" style={{ width: `${pocScore}%` }} />
        </div>
        <div className={`text-[10px] mt-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
          {t ? '每 30 天 Epoch 结算时更新 · 下次更新 5d 12h' : 'Updated each 30d Epoch · Next in 5d 12h'}
        </div>
      </div>

      {/* Formula */}
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

      {/* Dimensions */}
      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '五维得分明细' : 'Dimension Breakdown'}
        </div>
        <div className="space-y-3">
          {pocDimensions.map((dim) => (
            <div key={dim.key} className="ios-glass-inset p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{dim.key}</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? dim.labelZh : dim.labelEn}</span>
                  <span className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>×{(dim.weight * 100).toFixed(0)}%</span>
                </div>
                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{dim.value}</span>
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

      {/* Level diff */}
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
            <span className={isDark ? 'text-white/50' : 'text-[#160510]/50'}>{t ? '你的 V5 级差范围' : 'Your V5 diff range'}</span>
            <span className={isDark ? 'text-white/70' : 'text-[#160510]/70'}>16% – 38%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{t ? '当前实际级差' : 'Current diff rate'}</span>
            <span className="text-xl font-bold text-emerald-500">{levelDiffRate}%</span>
          </div>
          <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
            = 16% + (38% − 16%) × ({pocScore} ÷ 100) ≈ {levelDiffRate}%
          </p>
        </div>
      </div>

      {/* PoN brief */}
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
