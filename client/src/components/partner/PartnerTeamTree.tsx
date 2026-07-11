import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Search } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerSd3TransferModal } from '@/components/partner/PartnerSd3TransferModal';
import { partnerTreeLevelKey } from '@/components/partner/partnerData';
import { partnerTeamDepth, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
import {
  getTeamAlias,
  loadTeamAliases,
  setTeamAlias,
} from '@/components/partner/partnerTeamAliases';
import {
  PartnerInsetCell,
  PartnerLevelBadge,
  PartnerRaisedButton,
} from '@/components/partner/partnerUiKit';
import { cn } from '@/lib/utils';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const LAYER_LABEL_KEYS: Record<number, string> = {
  1: 'tree.layerFirst',
  2: 'tree.layerSecond',
  3: 'tree.layerThird',
  4: 'tree.layerFourth',
  5: 'tree.layerFifth',
};

function layerDepthLabel(depth: number, p: ReturnType<typeof usePartnerTranslation>): string {
  const key = LAYER_LABEL_KEYS[depth];
  return key ? p(key) : p('tree.layer', { depth });
}

function NodeStatGrid({
  node,
  isDark,
  p,
}: {
  node: PartnerTeamNode;
  isDark: boolean;
  p: ReturnType<typeof usePartnerTranslation>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PartnerInsetCell label={p('tree.personalStake')} value={`$${node.personalUsd.toLocaleString()}`} isDark={isDark} />
      <PartnerInsetCell label={p('tree.teamCount')} value={node.teamCount.toLocaleString()} isDark={isDark} />
      <PartnerInsetCell label={p('tree.teamPerf')} value={`$${node.teamUsd.toLocaleString()}`} isDark={isDark} />
      <PartnerInsetCell
        label={p('tree.newPerf')}
        value={`$${node.dailyNewUsd.toLocaleString()}`}
        isDark={isDark}
        accent
      />
    </div>
  );
}

function PartnerTeamNodeRemarkChip({
  alias,
  isDark,
  editable,
  p,
  onSave,
}: {
  alias: string;
  isDark: boolean;
  editable: boolean;
  p: ReturnType<typeof usePartnerTranslation>;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(alias);
  }, [alias, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    onSave(draft.trim());
    setEditing(false);
  };

  const chipClass =
    '!py-1 !px-2.5 text-[10px] font-bold rounded-full w-fit max-w-[7.5rem] truncate touch-manipulation';

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(alias);
            setEditing(false);
          }
        }}
        maxLength={32}
        placeholder={p('tree.remarkEmpty')}
        className={cn(
          chipClass,
          'partner-inset-cell outline-none min-w-[4.5rem]',
          isDark ? 'text-white placeholder:text-white/30' : 'text-[#160510] placeholder:text-[#160510]/35',
        )}
      />
    );
  }

  if (!editable && !alias) return null;

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => editable && setEditing(true)}
      className={cn(
        chipClass,
        editable && 'ios-glass-pressable',
        alias
          ? 'partner-level-badge'
          : isDark
            ? 'bg-white/[0.06] text-white/40 border border-dashed border-white/15'
            : 'bg-[#160510]/[0.04] text-[#160510]/40 border border-dashed border-[#160510]/15',
      )}
      style={alias ? { color: '#E0568F' } : undefined}
    >
      {alias || p('tree.remarkEmpty')}
    </button>
  );
}

function nodeLayerChipClass(isDirect: boolean, isDark: boolean): string {
  if (isDirect) return 'text-[#E0568F] bg-[#E0568F]/10 border border-[#E0568F]/20';
  return isDark
    ? 'text-white/45 bg-white/[0.06] border border-white/10'
    : 'text-[#160510]/50 bg-[#160510]/5 border border-[#160510]/10';
}

export function PartnerTeamTree({
  lang,
  isDark,
  wallet,
  nodes,
  loading = false,
  isPartner = false,
  transferQuota = 0,
  onTransferSd3,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  nodes: Record<string, PartnerTeamNode>;
  loading?: boolean;
  isPartner?: boolean;
  transferQuota?: number;
  onTransferSd3?: (toAddress: string, amount: number) => Promise<boolean>;
}) {
  const p = usePartnerTranslation(lang);
  const [focusId, setFocusId] = useState('me');
  const [q, setQ] = useState('');
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [transferTarget, setTransferTarget] = useState<PartnerTeamNode | null>(null);

  useEffect(() => {
    setAliases(loadTeamAliases(wallet));
  }, [wallet]);

  const saveAlias = useCallback(
    (address: string, alias: string) => {
      if (!wallet || address.trim().toLowerCase() === wallet.trim().toLowerCase()) return;
      setAliases((prev) => setTeamAlias(wallet, prev, address, alias));
    },
    [wallet],
  );

  const canTransfer = isPartner && transferQuota > 0 && Boolean(onTransferSd3);

  const focus = nodes[focusId] ?? nodes.me;
  const parent = focus?.parentId ? nodes[focus.parentId] : null;
  const children = focus?.childrenIds.map((id) => nodes[id]).filter(Boolean) ?? [];

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !focus) return [] as PartnerTeamNode[];
    return Object.values(nodes).filter((n) => {
      if (n.id === 'me') return false;
      const alias = getTeamAlias(aliases, n.address).toLowerCase();
      return (
        n.address.toLowerCase().includes(needle) ||
        n.short.toLowerCase().includes(needle) ||
        n.label.toLowerCase().includes(needle) ||
        alias.includes(needle)
      );
    });
  }, [q, nodes, focus, aliases]);

  const listNodes = q.trim() ? searchHits : children;

  function TreeNodeCard({ node }: { node: PartnerTeamNode }) {
    const levelKey = partnerTreeLevelKey(node.isPartner, node.teamUsd);
    const hasChildren = node.childrenIds.length > 0;
    const nodeDepth = partnerTeamDepth(nodes, node.id);
    const alias = getTeamAlias(aliases, node.address);
    const canEditRemark = Boolean(wallet) && node.id !== 'me';

    return (
      <div className={`partner-elevated-card p-4 space-y-3 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="flex flex-wrap items-center gap-1.5">
          <PartnerLevelBadge label={p(levelKey)} />
          <span
            className={cn(
              'text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0',
              nodeLayerChipClass(node.isDirect, isDark),
            )}
          >
            {node.isDirect ? p('tree.direct') : layerDepthLabel(nodeDepth, p)}
          </span>
          <PartnerTeamNodeRemarkChip
            alias={alias}
            isDark={isDark}
            editable={canEditRemark}
            p={p}
            onSave={(next) => saveAlias(node.address, next)}
          />
        </div>
        <AddressBlock value={node.address} isDark={isDark} compact showCopy />
        <NodeStatGrid node={node} isDark={isDark} p={p} />
        <div className="flex gap-2 pt-1">
          <PartnerRaisedButton
            variant="secondary"
            disabled={!hasChildren}
            onClick={() => setFocusId(node.id)}
          >
            {p('tree.viewDownline')}
          </PartnerRaisedButton>
          {canTransfer && node.id !== 'me' && (
            <PartnerRaisedButton onClick={() => setTransferTarget(node)}>
              {p('tree.transferSd3')}
            </PartnerRaisedButton>
          )}
        </div>
      </div>
    );
  }

  if (!focus) {
    return (
      <div className={`text-center py-12 text-sm ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
        {loading ? p('tree.loading') : p('tree.noDownline')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={glassCardClass('default', 'p-4')} data-guide="tree-panel">
        {focusId !== 'me' && (
          <div className="flex gap-2 mb-3">
            {parent && (
              <GlassButton
                variant="secondary"
                className="flex-1 !py-2 !text-xs flex items-center justify-center gap-1"
                onClick={() => setFocusId(parent.id)}
              >
                <ArrowUp size={12} /> {p('tree.up')}
              </GlassButton>
            )}
            <GlassButton variant="secondary" className="flex-1 !py-2 !text-xs" onClick={() => setFocusId('me')}>
              {p('tree.root')}
            </GlassButton>
          </div>
        )}

        <div className="flex items-center gap-2 partner-inset-cell px-3 py-2.5 mb-3" data-guide="tree-search">
          <Search size={14} className={isDark ? 'text-white/50' : 'text-[#160510]/50'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={p('tree.search')}
            className={`flex-1 bg-transparent text-xs outline-none ${isDark ? 'text-white placeholder:text-white/25' : 'text-[#160510] placeholder:text-[#160510]/45'}`}
          />
        </div>

        <div className="space-y-2">
          {listNodes.length === 0 ? (
            <div className={`text-sm py-4 text-center ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {q.trim() ? p('tree.noMatch') : p('tree.noDownline')}
            </div>
          ) : (
            listNodes.map((n) => <TreeNodeCard key={n.id} node={n} />)
          )}
        </div>
      </div>

      {transferTarget && onTransferSd3 && (
        <PartnerSd3TransferModal
          open={Boolean(transferTarget)}
          onClose={() => setTransferTarget(null)}
          lang={lang}
          isDark={isDark}
          toAddress={transferTarget.address}
          levelLabel={p(partnerTreeLevelKey(transferTarget.isPartner, transferTarget.teamUsd))}
          layerLabel={
            transferTarget.isDirect
              ? p('tree.direct')
              : layerDepthLabel(partnerTeamDepth(nodes, transferTarget.id), p)
          }
          recipientIsDirect={transferTarget.isDirect}
          toAlias={getTeamAlias(aliases, transferTarget.address) || undefined}
          transferQuota={transferQuota}
          onConfirm={(amount) => onTransferSd3(transferTarget.address, amount)}
        />
      )}
    </div>
  );
}
