import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, ChevronRight, Layers, Search, Users } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import { partnerTeamDepth, partnerTeamNodes, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

export function PartnerTeamTree({
  lang,
  isDark,
  nodes = partnerTeamNodes,
}: {
  lang: AppLang;
  isDark: boolean;
  nodes?: Record<string, PartnerTeamNode>;
}) {
  const p = usePartnerTranslation(lang);
  const [focusId, setFocusId] = useState('me');
  const [q, setQ] = useState('');

  const focus = nodes[focusId] ?? nodes.me;
  const parent = focus.parentId ? nodes[focus.parentId] : null;
  const children = focus.childrenIds.map((id) => nodes[id]).filter(Boolean);
  const currentDepth = useMemo(() => partnerTeamDepth(nodes, focusId), [nodes, focusId]);
  const layerLabel =
    focusId === 'me'
      ? p('tree.layerMe', { depth: currentDepth })
      : p('tree.layer', { depth: currentDepth });

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [] as PartnerTeamNode[];
    return Object.values(nodes).filter(
      (n) =>
        n.id !== 'me' &&
        (n.address.toLowerCase().includes(needle) ||
          n.short.toLowerCase().includes(needle) ||
          n.label.toLowerCase().includes(needle)),
    );
  }, [q, nodes]);

  return (
    <div className="space-y-4">
      <div className={glassCardClass('highlight', 'p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-[#E0568F]" />
          <span className="site-section-title">{p('tree.title')}</span>
        </div>
        <GlassChip className="!py-1 !px-2 text-[10px] font-bold mb-2 flex items-center gap-1 w-fit" style={{ color: '#E0568F' }}>
          <Layers size={11} />
          {layerLabel}
        </GlassChip>
        <AddressBlock label={focus.label} value={focus.address} isDark={isDark} compact />
        <div className="grid grid-cols-2 gap-2 text-xs mt-3">
          <div className="ios-glass-inset p-2.5">
            <div className="site-stat-label">{p('tree.teamPerf')}</div>
            <div className="font-bold">${focus.teamUsd.toLocaleString()}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className="site-stat-label">{p('team.todayNew')}</div>
            <div className="font-bold text-emerald-500">${focus.dailyNewUsd.toLocaleString()}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <GlassButton
            variant="secondary"
            className="flex-1 !py-2 !text-xs flex items-center justify-center gap-1"
            disabled={!parent}
            onClick={() => parent && setFocusId(parent.id)}
          >
            <ArrowUp size={12} /> {p('tree.up')}
          </GlassButton>
          <GlassButton variant="secondary" className="flex-1 !py-2 !text-xs" onClick={() => setFocusId('me')}>
            {p('tree.root')}
          </GlassButton>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-4')}>
        <div className="flex items-center gap-2 ios-glass-inset px-3 py-2.5 mb-3">
          <Search size={14} className={isDark ? 'text-white/50' : 'text-[#160510]/50'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={p('tree.search')}
            className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/45'}`}
          />
        </div>
        {q.trim() ? (
          <div className="space-y-1">
            {searchHits.length === 0 && (
              <div className={`text-sm py-3 text-center ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {p('tree.noMatch')}
              </div>
            )}
            {searchHits.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { setFocusId(n.id); setQ(''); }}
                className="w-full text-left ios-glass-pressable rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold mb-1">{n.label} · ${n.teamUsd.toLocaleString()}</div>
                  <AddressBlock value={n.address} isDark={isDark} compact showCopy />
                </div>
                <ChevronRight size={14} className="shrink-0 opacity-40" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {children.length === 0 ? (
              <div className={`text-sm text-center py-4 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {p('tree.noDownline')}
              </div>
            ) : (
              children.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setFocusId(n.id)}
                  className="w-full text-left rounded-xl px-3 py-3 ios-glass-inset ios-glass-pressable flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold mb-1 flex flex-wrap gap-2">
                      <span>{n.label}</span>
                      <span className="text-emerald-500">+${n.dailyNewUsd.toLocaleString()}</span>
                      {n.isDirect && <span className="text-[#E0568F]">{p('tree.direct')}</span>}
                    </div>
                    <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
                      {p('tree.team')} ${n.teamUsd.toLocaleString()}
                    </div>
                    <AddressBlock value={n.address} isDark={isDark} compact />
                  </div>
                  <span className="text-xs font-semibold text-[#E0568F] flex items-center gap-0.5 shrink-0">
                    {p('tree.open')} <ArrowRight size={12} />
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
