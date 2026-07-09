import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, ChevronRight, Layers, Search, Users } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import { unionTeamNodes, type UnionTeamNode } from '@/components/union/unionData';
import { cn } from '@/lib/utils';
import type { D3FiViewModel } from '@/lib/d3fiViewModel';
import { vLevelTable } from './protocolData';

type Lang = 'zh' | 'en';

function teamDepthFromMe(teamNodes: Record<string, UnionTeamNode>, nodeId: string): number {
  let depth = 0;
  let id = nodeId;
  while (id !== 'me') {
    const node = teamNodes[id];
    if (!node?.parentId) return depth;
    depth += 1;
    id = node.parentId;
  }
  return depth;
}

export function TeamTreeTab({
  lang,
  isDark,
  vm,
}: {
  lang: Lang;
  isDark: boolean;
  vm?: D3FiViewModel | null;
  wallet?: string | null;
}) {
  const t = lang === 'zh';
  const perf = vm?.teamPerformance ?? {
    level: 'V0',
    levelRange: 'V0',
    directCount: 0,
    teamCount: 0,
    validCount: 0,
    largeAreaUsd: 0,
    smallAreaUsd: 0,
  };

  const teamNodes = vm?.teamNodes ?? unionTeamNodes;
  const [focusId, setFocusId] = useState('me');
  const [q, setQ] = useState('');

  const focus = teamNodes[focusId] ?? teamNodes.me;
  const parent = focus.parentId ? teamNodes[focus.parentId] : null;
  const children = focus.childrenIds.map((id) => teamNodes[id]).filter(Boolean);
  const currentDepth = useMemo(() => teamDepthFromMe(teamNodes, focusId), [teamNodes, focusId]);
  const layerLabel =
    focusId === 'me'
      ? t
        ? `第 ${currentDepth} 层 · 我`
        : `Layer ${currentDepth} · You`
      : t
        ? `第 ${currentDepth} 层`
        : `Layer ${currentDepth}`;
  const childLayerLabel = t ? `第 ${currentDepth + 1} 层 · 下级节点` : `Layer ${currentDepth + 1} · Downline`;

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [] as UnionTeamNode[];
    return Object.values(teamNodes).filter(
      (n) =>
        n.id !== 'me' &&
        (n.address.toLowerCase().includes(needle) ||
          n.short.toLowerCase().includes(needle) ||
          n.level.toLowerCase().includes(needle)),
    );
  }, [q, teamNodes]);

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="site-stat-label">{t ? '当前等级' : 'Current Level'}</div>
            <div className="site-stat-value-lg site-stat-value-accent">{perf.level}</div>
          </div>
          <div className="text-right">
            <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? '级差范围' : 'Level Diff'}</div>
            <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>{perf.levelRange}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { value: String(perf.directCount), label: t ? '直推' : 'Direct' },
            { value: String(perf.teamCount), label: t ? '团队人数' : 'Team Size' },
            { value: String(perf.validCount), label: t ? '有效户' : 'Valid' },
          ].map((stat) => (
            <div key={stat.label} className="ios-glass-inset p-2.5">
              <div className="site-stat-value-md site-stat-value-accent">{stat.value}</div>
              <div className="site-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '大区 / 小区业绩' : 'Large / Small Area'}
        </div>
        <p className={`text-[10px] mb-3 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
          {t ? 'V5 及以上需同时考核大区与小区；小区业绩 = 大区业绩 × 30%' : 'V5+ requires both areas; small area = large area × 30%'}
        </p>
        {[
          { label: t ? '个人业绩' : 'Personal', current: `$${perf.largeAreaUsd.toLocaleString()}`, req: '—', pct: perf.largeAreaUsd > 0 ? 100 : 0 },
          { label: t ? '大区业绩' : 'Large Area', current: `$${perf.largeAreaUsd.toLocaleString()}`, req: '—', pct: perf.largeAreaUsd > 0 ? 100 : 0 },
          { label: t ? '小区业绩' : 'Small Area', current: `$${perf.smallAreaUsd.toLocaleString()}`, req: '—', pct: perf.smallAreaUsd > 0 ? 100 : 0 },
        ].map((row) => (
          <div key={row.label} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className={isDark ? 'text-white/60' : 'text-[#160510]/60'}>{row.label}</span>
              <span className={isDark ? 'text-white' : 'text-[#160510]'}>
                {row.current} <span className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>/ {row.req}</span>
              </span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#8A2B57]/[0.06]'}`}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#8A2B57] to-emerald-500" style={{ width: `${Math.min(100, row.pct)}%` }} />
            </div>
          </div>
        ))}
        <div className={`mt-3 text-[10px] px-2 py-1.5 rounded-lg ${isDark ? 'bg-white/[0.04] text-white/50' : 'bg-[#8A2B57]/[0.04] text-[#160510]/50'}`}>
          {t ? `直推 ${perf.directCount} 人 · 团队 ${perf.teamCount} 人` : `${perf.directCount} direct · ${perf.teamCount} team members`}
        </div>
      </div>

      <div className={glassCardClass('highlight', 'p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-[#E0568F]" />
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
            {t ? '团队推荐树' : 'Referral Tree'}
          </div>
        </div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <div className={`text-xs font-semibold ${isDark ? 'text-white/55' : 'text-[#160510]/55'}`}>
                {t ? '当前层' : 'Current layer'}
              </div>
              <GlassChip className="!py-1 !px-2 text-[10px] font-bold flex items-center gap-1" style={{ color: '#E0568F' }}>
                <Layers size={11} />
                {layerLabel}
              </GlassChip>
            </div>
            <AddressBlock label={t ? '节点地址' : 'Node address'} value={focus.address} isDark={isDark} compact />
          </div>
          <GlassChip className="!py-1 !px-2 text-xs font-bold shrink-0" style={{ color: '#E0568F' }}>
            {focus.level}
          </GlassChip>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '个人业绩' : 'Personal'}</div>
            <div className="font-bold mt-0.5">${focus.personalUsd.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '团队业绩' : 'Team'}</div>
            <div className="font-bold mt-0.5">${focus.teamUsd.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '直推' : 'Direct'}</div>
            <div className="font-bold mt-0.5">{focus.directCount}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/45' : 'text-[#160510]/45'}>{t ? '伞下人数' : 'Umbrella'}</div>
            <div className="font-bold mt-0.5">{focus.teamCount}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <GlassButton
            variant="secondary"
            className="flex-1 !py-2.5 !text-xs flex items-center justify-center gap-1"
            disabled={!parent}
            onClick={() => parent && setFocusId(parent.id)}
          >
            <ArrowUp size={12} /> {t ? '上一层' : 'Up'}
          </GlassButton>
          <GlassButton variant="secondary" className="flex-1 !py-2.5 !text-xs" onClick={() => setFocusId('me')}>
            {t ? '回到我' : 'My root'}
          </GlassButton>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-4')}>
        <div className="flex items-center gap-2 ios-glass-inset px-3 py-2.5">
          <Search size={14} className={isDark ? 'text-white/50' : 'text-[#160510]/50'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t ? '搜索地址 / 等级' : 'Search address / level'}
            className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/45'}`}
          />
        </div>
        {q.trim() && (
          <div className="mt-3 space-y-1">
            {searchHits.length === 0 && (
              <div className={`text-sm font-medium py-3 text-center ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {t ? '无匹配节点' : 'No matches'}
              </div>
            )}
            {searchHits.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setFocusId(n.id);
                  setQ('');
                }}
                className={`w-full text-left ios-glass-pressable rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-[#8A2B57]/[0.04]'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-semibold mb-1.5 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
                    {t ? `第 ${teamDepthFromMe(teamNodes, n.id)} 层` : `Layer ${teamDepthFromMe(teamNodes, n.id)}`}
                    {' · '}
                    {n.level}
                  </div>
                  <AddressBlock value={n.address} isDark={isDark} compact showCopy />
                </div>
                <ChevronRight size={14} className={`shrink-0 ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
          {childLayerLabel}
        </div>
        <p className={`text-[10px] font-medium mb-3 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {t ? `从当前第 ${currentDepth} 层向下查看，点击节点进入下一层` : `Drill down from layer ${currentDepth} — tap a node to go deeper`}
        </p>
        {children.length === 0 ? (
          <div className={`text-sm font-medium text-center py-6 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            {t ? '没有更下层节点' : 'No deeper nodes'}
          </div>
        ) : (
          <div className="space-y-2">
            {children.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setFocusId(n.id)}
                className="w-full text-left rounded-xl px-3 py-3 ios-glass-inset ios-glass-pressable flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-semibold mb-1.5 flex flex-wrap gap-2 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
                    <span>{t ? `第 ${currentDepth + 1} 层` : `Layer ${currentDepth + 1}`}</span>
                    <span>{n.level}</span>
                    <span>${n.teamUsd.toLocaleString()}</span>
                    {n.isDirect && <span className="text-[#E0568F]">{t ? '直推' : 'Direct'}</span>}
                  </div>
                  <AddressBlock value={n.address} isDark={isDark} compact />
                </div>
                <span className={`shrink-0 text-xs font-semibold flex items-center gap-0.5 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t ? '进入' : 'Open'} <ArrowRight size={12} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={glassCardClass('default', 'p-4 sm:p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '等级晋升参考' : 'Level Requirements'}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[340px] text-[10px]">
            <thead>
              <tr className={isDark ? 'text-white/35' : 'text-[#160510]/35'}>
                <th className="text-left py-1.5 px-1">{t ? '等级' : 'Level'}</th>
                <th className="text-left py-1.5 px-1">{t ? '个人' : 'Personal'}</th>
                <th className="text-left py-1.5 px-1">{t ? '大区' : 'Large'}</th>
                <th className="text-left py-1.5 px-1">{t ? '小区' : 'Small'}</th>
                <th className="text-left py-1.5 px-1">{t ? '级差' : 'Diff'}</th>
              </tr>
            </thead>
            <tbody>
              {vLevelTable.map((row) => (
                <tr
                  key={row.level}
                  className={cn(
                    'border-t',
                    isDark ? 'border-white/[0.04]' : 'border-[#8A2B57]/[0.04]',
                    row.level === perf.level && 'bg-[#E0568F]/[0.06]',
                  )}
                >
                  <td
                    className={`py-2 px-1 font-semibold ${row.level === perf.level ? 'text-[#E0568F]' : isDark ? 'text-white/70' : 'text-[#160510]/70'}`}
                  >
                    {row.level}
                  </td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{row.personal}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{row.large}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{row.small}</td>
                  <td className={`py-2 px-1 ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>{row.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
