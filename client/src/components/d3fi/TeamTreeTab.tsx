import { ChevronRight, Users } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import { teamPerformance, teamTree, vLevelTable, type TeamNode } from './protocolData';

type Lang = 'zh' | 'en';

function TreeNode({ node, lang, isDark, defaultOpen = true }: { node: TeamNode; lang: Lang; isDark: boolean; defaultOpen?: boolean }) {
  const t = lang === 'zh';
  const hasChildren = node.children && node.children.length > 0;
  const indent = node.depth * 12;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2.5 border-b last:border-0 ios-glass-pressable',
          isDark ? 'border-white/[0.04]' : 'border-[#6B1A3A]/[0.04]',
          node.depth === 0 && 'font-semibold',
        )}
        style={{ paddingLeft: `${indent + 8}px` }}
      >
        {hasChildren ? <ChevronRight size={12} className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'} /> : <span className="w-3" />}
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] truncate ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{node.address}</div>
          <div className={`text-[9px] flex gap-2 mt-0.5 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
            <span>{node.level}</span>
            <span>{t ? '个人' : 'Personal'}: {node.personal}</span>
            {node.isDirect && <span className="text-[#C9A96E]">{t ? '直推' : 'Direct'}</span>}
          </div>
        </div>
      </div>
      {hasChildren && defaultOpen && node.children!.map((child) => (
        <TreeNode key={child.id} node={child} lang={lang} isDark={isDark} />
      ))}
    </div>
  );
}

export function TeamTreeTab({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';
  const perf = teamPerformance;

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A96E]/40 to-transparent" />
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-xs ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>{t ? '当前等级' : 'Current Level'}</div>
            <div className="text-2xl font-bold font-heading" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>{perf.level}</div>
          </div>
          <div className="text-right">
            <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '级差范围' : 'Level Diff'}</div>
            <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{perf.levelRange}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { value: String(perf.directCount), label: t ? '直推' : 'Direct' },
            { value: String(perf.teamCount), label: t ? '团队人数' : 'Team Size' },
            { value: String(perf.validCount), label: t ? '有效户' : 'Valid' },
          ].map((stat) => (
            <div key={stat.label} className="ios-glass-inset p-2.5">
              <div className="text-lg font-bold font-heading" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>{stat.value}</div>
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Large / Small area */}
      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? '大区 / 小区业绩' : 'Large / Small Area'}
        </div>
        <p className={`text-[10px] mb-3 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
          {t ? 'V5 及以上需同时考核大区与小区；小区业绩 = 大区业绩 × 30%' : 'V5+ requires both areas; small area = large area × 30%'}
        </p>
        {[
          { label: t ? '个人业绩' : 'Personal', current: perf.personal, req: perf.personalReq, pct: 107 },
          { label: t ? '大区业绩' : 'Large Area', current: perf.largeArea, req: perf.largeAreaReq, pct: 107 },
          { label: t ? '小区业绩' : 'Small Area', current: perf.smallArea, req: perf.smallAreaReq, pct: 107 },
        ].map((row) => (
          <div key={row.label} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={isDark ? 'text-white/60' : 'text-[#2C2824]/60'}>{row.label}</span>
              <span className={isDark ? 'text-white' : 'text-[#2C2824]'}>
                {row.current} <span className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>/ {row.req}</span>
              </span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#6B1A3A]/[0.06]'}`}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#6B1A3A] to-emerald-500" style={{ width: `${Math.min(100, row.pct)}%` }} />
            </div>
          </div>
        ))}
        <div className={`mt-3 text-[10px] px-2 py-1.5 rounded-lg ${isDark ? 'bg-emerald-500/10 text-emerald-500/80' : 'bg-emerald-500/8 text-emerald-600'}`}>
          {t ? `距 ${perf.nextLevel} 还需小区业绩 +$0（已达标）` : `To ${perf.nextLevel}: small area requirement met`}
        </div>
      </div>

      {/* Referral tree */}
      <div className={glassCardClass('default', 'p-4 sm:p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-[#C9A96E]" />
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '团队推荐树' : 'Referral Tree'}
          </div>
        </div>
        <TreeNode node={teamTree} lang={lang} isDark={isDark} />
      </div>

      {/* V-level reference */}
      <div className={glassCardClass('default', 'p-4 sm:p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? '等级晋升参考' : 'Level Requirements'}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[340px] text-[10px]">
            <thead>
              <tr className={isDark ? 'text-white/35' : 'text-[#2C2824]/35'}>
                <th className="text-left py-1.5 px-1">{t ? '等级' : 'Level'}</th>
                <th className="text-left py-1.5 px-1">{t ? '个人' : 'Personal'}</th>
                <th className="text-left py-1.5 px-1">{t ? '大区' : 'Large'}</th>
                <th className="text-left py-1.5 px-1">{t ? '小区' : 'Small'}</th>
                <th className="text-left py-1.5 px-1">{t ? '级差' : 'Diff'}</th>
              </tr>
            </thead>
            <tbody>
              {vLevelTable.map((row) => (
                <tr key={row.level} className={cn('border-t', isDark ? 'border-white/[0.04]' : 'border-[#6B1A3A]/[0.04]', row.level === perf.level && 'bg-[#C9A96E]/[0.06]')}>
                  <td className={`py-2 px-1 font-semibold ${row.level === perf.level ? 'text-[#C9A96E]' : isDark ? 'text-white/70' : 'text-[#2C2824]/70'}`}>{row.level}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>{row.personal}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>{row.large}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>{row.small}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>{row.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
