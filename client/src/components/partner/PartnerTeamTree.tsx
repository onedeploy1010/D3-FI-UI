import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUp, Layers, Search, Users } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import { PartnerSd3TransferModal } from '@/components/partner/PartnerSd3TransferModal';
import { partnerTreeLevelKey } from '@/components/partner/partnerData';
import { partnerTeamDepth, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

function TreeNodeStats({
  node,
  nodes,
  isDark,
  p,
}: {
  node: PartnerTeamNode;
  nodes: Record<string, PartnerTeamNode>;
  isDark: boolean;
  p: ReturnType<typeof usePartnerTranslation>;
}) {
  const depth = partnerTeamDepth(nodes, node.id);
  const levelKey = partnerTreeLevelKey(node.isPartner, node.teamUsd);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <GlassChip className="!py-0.5 !px-2 text-[9px] font-bold" style={{ color: '#E0568F' }}>
          {p('tree.layer', { depth })}
        </GlassChip>
        {node.isDirect && (
          <span className="text-[9px] font-semibold text-[#E0568F]">{p('tree.direct')}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] mb-2">
        <div>
          <span className={`site-stat-label ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {p('tree.personalStake')}
          </span>
          <div className={`font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            ${node.personalUsd.toLocaleString()}
          </div>
        </div>
        <div>
          <span className={`site-stat-label ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {p('tree.teamCount')}
          </span>
          <div className={`font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {node.teamCount.toLocaleString()}
          </div>
        </div>
        <div>
          <span className={`site-stat-label ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {p('tree.teamPerf')}
          </span>
          <div className={`font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            ${node.teamUsd.toLocaleString()}
          </div>
        </div>
        <div>
          <span className={`site-stat-label ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {p('tree.partnerLevel')}
          </span>
          <div className={`font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p(levelKey)}
          </div>
        </div>
      </div>
    </>
  );
}

export function PartnerTeamTree({
  lang,
  isDark,
  nodes,
  loading = false,
  isPartner = false,
  transferQuota = 0,
  onTransferSd3,
}: {
  lang: AppLang;
  isDark: boolean;
  nodes: Record<string, PartnerTeamNode>;
  loading?: boolean;
  isPartner?: boolean;
  transferQuota?: number;
  onTransferSd3?: (toAddress: string, amount: number) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const [focusId, setFocusId] = useState('me');
  const [q, setQ] = useState('');
  const [transferTarget, setTransferTarget] = useState<PartnerTeamNode | null>(null);

  const canTransfer = isPartner && transferQuota > 0 && Boolean(onTransferSd3);

  const transferProps = (node: PartnerTeamNode) =>
    canTransfer && node.id !== 'me'
      ? {
          onTransfer: () => setTransferTarget(node),
          transferAriaLabel: p('tree.transferSd3'),
          transferLabel: p('tree.sd3Label'),
        }
      : {};

  function TreeNodeCard({
    node,
    onOpen,
  }: {
    node: PartnerTeamNode;
    onOpen: () => void;
  }) {
    return (
      <div className="rounded-xl px-3 py-3 ios-glass-inset space-y-2">
        <button type="button" onClick={onOpen} className="w-full text-left ios-glass-pressable">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className={`text-xs font-semibold min-w-0 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {node.label}
            </div>
            <span className="text-[10px] font-semibold text-[#E0568F] flex items-center gap-0.5 shrink-0 pt-0.5">
              {p('tree.open')} <ArrowRight size={12} />
            </span>
          </div>
          <TreeNodeStats node={node} nodes={nodes} isDark={isDark} p={p} />
        </button>
        <AddressBlock
          value={node.address}
          isDark={isDark}
          compact
          showCopy
          {...transferProps(node)}
        />
      </div>
    );
  }

  const focus = nodes[focusId] ?? nodes.me;
  const parent = focus?.parentId ? nodes[focus.parentId] : null;
  const children = focus?.childrenIds.map((id) => nodes[id]).filter(Boolean) ?? [];
  const currentDepth = useMemo(() => (focus ? partnerTeamDepth(nodes, focusId) : 0), [nodes, focusId, focus]);
  const layerLabel = !focus
    ? ''
    : focusId === 'me'
      ? p('tree.layerMe', { depth: currentDepth })
      : p('tree.layer', { depth: currentDepth });

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !focus) return [] as PartnerTeamNode[];
    return Object.values(nodes).filter(
      (n) =>
        n.id !== 'me' &&
        (n.address.toLowerCase().includes(needle) ||
          n.short.toLowerCase().includes(needle) ||
          n.label.toLowerCase().includes(needle)),
    );
  }, [q, nodes, focus]);

  if (!focus) {
    return (
      <div className={`text-center py-12 text-sm ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
        {loading ? p('tree.loading') : p('tree.noDownline')}
      </div>
    );
  }

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
        <AddressBlock
          label={focus.label}
          value={focus.address}
          isDark={isDark}
          compact
          {...transferProps(focus)}
        />
        <div className="mt-3">
          <TreeNodeStats node={focus} nodes={nodes} isDark={isDark} p={p} />
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
              <TreeNodeCard
                key={n.id}
                node={n}
                onOpen={() => { setFocusId(n.id); setQ(''); }}
              />
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
                <TreeNodeCard key={n.id} node={n} onOpen={() => setFocusId(n.id)} />
              ))
            )}
          </div>
        )}
      </div>

      {transferTarget && onTransferSd3 && (
        <PartnerSd3TransferModal
          open={Boolean(transferTarget)}
          onClose={() => setTransferTarget(null)}
          lang={lang}
          isDark={isDark}
          toAddress={transferTarget.address}
          toLabel={transferTarget.label}
          transferQuota={transferQuota}
          onConfirm={(amount) => onTransferSd3(transferTarget.address, amount)}
        />
      )}
    </div>
  );
}
