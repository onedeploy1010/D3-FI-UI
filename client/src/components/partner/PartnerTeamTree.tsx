import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUp, ChevronDown, Search, Pencil } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import { PartnerUd3TransferModal } from '@/components/partner/PartnerUd3TransferModal';
import { resolveUd3SLevel, UD3_TIERS } from '@/components/partner/ud3Rules';
import { computePartnerAreaStats, partnerTeamDepth, mergeGuideMockDownline, pickGuideTransferTargetId, sumDownlinePersonalUsd, type PartnerTeamNode } from '@/components/partner/partnerTeamData';
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
  downlineUsd,
  isDark,
  p,
}: {
  node: PartnerTeamNode;
  /** 伞下业绩 = downline personal stakes only (excludes this node's own stake). */
  downlineUsd: number;
  isDark: boolean;
  p: ReturnType<typeof usePartnerTranslation>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PartnerInsetCell label={p('tree.personalStake')} value={`$${node.personalUsd.toLocaleString()}`} isDark={isDark} />
      <PartnerInsetCell label={p('tree.teamCount')} value={node.teamCount.toLocaleString()} isDark={isDark} />
      <PartnerInsetCell label={p('tree.teamPerf')} value={`$${downlineUsd.toLocaleString()}`} isDark={isDark} />
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
    '!py-1 !px-2.5 text-[10px] font-bold rounded-full w-fit max-w-[9rem] inline-flex items-center gap-1 touch-manipulation';

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
      aria-label={p('tree.remarkPlaceholder')}
      className={cn(
        chipClass,
        editable && 'ios-glass-pressable',
        alias
          ? 'partner-level-badge'
          : isDark
            ? 'bg-white/[0.06] text-white/45 border border-dashed border-white/20'
            : 'bg-[#160510]/[0.04] text-[#160510]/45 border border-dashed border-[#160510]/20',
      )}
      style={alias ? { color: '#E0568F' } : undefined}
    >
      <span className="truncate">{alias || p('tree.remarkPlaceholder')}</span>
      {editable && <Pencil size={10} className="shrink-0 opacity-70" aria-hidden />}
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
  onTransferUd3,
  transferGuideActive = false,
  transferGuideStep = -1,
  jumpFocusId = null,
  jumpToken = 0,
  onJumpFocusConsumed,
}: {
  lang: AppLang;
  isDark: boolean;
  wallet: string | null;
  nodes: Record<string, PartnerTeamNode>;
  loading?: boolean;
  isPartner?: boolean;
  transferQuota?: number;
  onTransferUd3?: (toAddress: string, amount: number) => Promise<boolean>;
  transferGuideActive?: boolean;
  transferGuideStep?: number;
  /** External jump from UD3 rewards → focus this node id once. */
  jumpFocusId?: string | null;
  /** Changes on every jump click (same node can be jumped to repeatedly). */
  jumpToken?: number;
  onJumpFocusConsumed?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const [focusId, setFocusId] = useState('me');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Per-node detail (stat grid) expansion — collapsed by default for a cleaner tree.
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const toggleNodeExpanded = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [q, setQ] = useState('');
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [transferTarget, setTransferTarget] = useState<PartnerTeamNode | null>(null);
  const lastJumpTokenRef = useRef(0);

  useEffect(() => {
    setAliases(loadTeamAliases(wallet));
  }, [wallet]);

  useEffect(() => {
    if (transferGuideActive) {
      setFocusId('me');
      setQ('');
      setHighlightId(null);
    }
  }, [transferGuideActive]);

  useEffect(() => {
    if (!jumpFocusId || !jumpToken || jumpToken === lastJumpTokenRef.current) return;
    lastJumpTokenRef.current = jumpToken;
    const target = nodes[jumpFocusId];
    if (!target) {
      onJumpFocusConsumed?.();
      return;
    }
    /** Focus parent so the target appears as a listed card. */
    const parentFocus =
      target.id === 'me' ? 'me' : target.parentId && nodes[target.parentId] ? target.parentId : 'me';
    setFocusId(parentFocus);
    setHighlightId(target.id);
    setQ('');

    const scrollTimer = window.setTimeout(() => {
      document
        .querySelector(`[data-team-node-id="${target.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const clearTimer = window.setTimeout(() => onJumpFocusConsumed?.(), 120);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [jumpFocusId, jumpToken, nodes, onJumpFocusConsumed]);

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 2800);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  const saveAlias = useCallback(
    (address: string, alias: string) => {
      if (!wallet || address.trim().toLowerCase() === wallet.trim().toLowerCase()) return;
      setAliases((prev) => setTeamAlias(wallet, prev, address, alias));
    },
    [wallet],
  );

  // Show the 转账UD3 affordance for any partner (even with 0 settled UD3 — the button
  // then renders disabled) so it never silently vanishes; quota only gates enablement.
  const canTransfer = isPartner && Boolean(onTransferUd3);

  const displayNodes = useMemo(() => {
    if (!transferGuideActive) return nodes;
    return mergeGuideMockDownline(nodes, p('tree.guideMockLabel'));
  }, [nodes, transferGuideActive, p]);

  const guideTargetId = useMemo(
    () => (transferGuideActive ? pickGuideTransferTargetId(displayNodes) : null),
    [displayNodes, transferGuideActive],
  );

  const focus = displayNodes[focusId] ?? displayNodes.me;
  const parent = focus?.parentId ? displayNodes[focus.parentId] : null;
  const children = focus?.childrenIds.map((id) => displayNodes[id]).filter(Boolean) ?? [];

  const searchHits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !focus) return [] as PartnerTeamNode[];
    return Object.values(displayNodes).filter((n) => {
      if (n.id === 'me') return false;
      const alias = getTeamAlias(aliases, n.address).toLowerCase();
      return (
        n.address.toLowerCase().includes(needle) ||
        n.short.toLowerCase().includes(needle) ||
        n.label.toLowerCase().includes(needle) ||
        alias.includes(needle)
      );
    });
  }, [q, displayNodes, focus, aliases]);

  const listNodes = q.trim() ? searchHits : children;

  // 大区 = 当前直推层里「个人质押 + 伞下业绩」最大的一条线；其余直推都算小区。
  // 仅在非搜索且 ≥2 条直推时标识（此时大/小区之分才有意义）。并列最大取第一条。
  const bigAreaId = (() => {
    // 仅在【我的直推层】(focus 为本人) 标识大区；下钻到更深层不标。
    if (focusId !== 'me' || q.trim() || children.length < 2) return null;
    let bestId: string | null = null;
    let bestVal = -Infinity;
    for (const c of children) {
      const lineVal = (c.personalUsd || 0) + (c.teamUsd || 0);
      if (lineVal > bestVal) {
        bestVal = lineVal;
        bestId = c.id;
      }
    }
    return bestId;
  })();

  function TreeNodeCard({ node, index }: { node: PartnerTeamNode; index: number }) {
    const isBigArea = node.id === bigAreaId;
    const hasChildren = node.childrenIds.length > 0;
    const nodeDepth = partnerTeamDepth(displayNodes, node.id);
    const alias = getTeamAlias(aliases, node.address);
    const canEditRemark = Boolean(wallet) && node.id !== 'me' && !node.isGuideMock;
    // 统一等级：S1=总业绩≥100(含本人质押,故已入金的下级也显示S1)；S2-S6=该节点小区业绩。
    const nodeSLevel = resolveUd3SLevel({
      totalPerfUsdt: (node.teamUsd || 0) + (node.personalUsd || 0),
      smallAreaPerfUsdt: computePartnerAreaStats(displayNodes, node.id).smallAreaUsd,
    });
    const nodeLevel = nodeSLevel ? (UD3_TIERS[nodeSLevel.id - 1] ?? null) : null;
    const showTransferBtn =
      node.id !== 'me' &&
      ((canTransfer && !node.isGuideMock) ||
        (transferGuideActive && node.id === guideTargetId));
    const highlightTransfer =
      transferGuideActive && transferGuideStep === 2 && node.id === guideTargetId;

    return (
      <div
        data-team-node-id={node.id}
        style={{ ['--rise-delay']: `${Math.min(index, 8) * 45}ms` } as CSSProperties}
        className={cn(
          `partner-elevated-card animate-tile-rise p-4 space-y-3 ${glassCardClass('default', '')}`,
          node.isGuideMock && 'border border-dashed border-[#E0568F]/35',
          isBigArea && 'ring-2 ring-amber-400/70 border border-amber-400/50 shadow-[0_0_0_1px_rgba(251,191,36,0.30)]',
          highlightId === node.id && 'ring-2 ring-[#E0568F]/55 shadow-[0_0_0_1px_rgba(224,86,143,0.35)]',
        )}
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="flex flex-wrap items-center gap-1.5">
          <PartnerLevelBadge
            label={
              nodeLevel
                ? p('ud3.levelBadge', { level: nodeLevel.label, pct: nodeLevel.ratePct })
                : p('ud3.tierNone')
            }
          />
          <span
            className={cn(
              'text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0',
              nodeLayerChipClass(node.isDirect, isDark),
            )}
          >
            {node.isDirect ? p('tree.direct') : layerDepthLabel(nodeDepth, p)}
          </span>
          {isBigArea && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-600 bg-amber-400/15 border border-amber-400/45">
              {p('tree.bigAreaBadge')}
            </span>
          )}
          <PartnerTeamNodeRemarkChip
            alias={alias}
            isDark={isDark}
            editable={canEditRemark}
            p={p}
            onSave={(next) => saveAlias(node.address, next)}
          />
          {node.isGuideMock && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-[#E0568F] bg-[#E0568F]/10 border border-[#E0568F]/20">
              {p('tree.guideMockBadge')}
            </span>
          )}
        </div>
        <AddressBlock value={node.address} isDark={isDark} compact showCopy />
        <button
          type="button"
          onClick={() => toggleNodeExpanded(node.id)}
          className={`tap-press w-full flex items-center justify-between text-[11px] font-semibold py-0.5 ${
            isDark ? 'text-[#E0568F]/85' : 'text-[#8A2B57]/85'
          }`}
          aria-expanded={expandedNodes.has(node.id)}
        >
          <span>{p('tree.detailToggle')}</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expandedNodes.has(node.id) ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {expandedNodes.has(node.id) && (
          <NodeStatGrid
            node={node}
            downlineUsd={sumDownlinePersonalUsd(displayNodes, node.id)}
            isDark={isDark}
            p={p}
          />
        )}
        <div className="flex gap-2 pt-1">
          <PartnerRaisedButton
            variant="secondary"
            disabled={!hasChildren}
            onClick={() => setFocusId(node.id)}
          >
            {p('tree.viewDownline')}
          </PartnerRaisedButton>
          {showTransferBtn && (
            <PartnerRaisedButton
              data-guide={highlightTransfer ? 'tree-transfer-btn' : undefined}
              disabled={!transferGuideActive && transferQuota <= 0}
              className={cn(
                highlightTransfer &&
                  'ring-2 ring-[#E0568F] ring-offset-2 ring-offset-transparent shadow-[0_0_20px_rgba(224,86,143,0.45)] animate-pulse',
              )}
              onClick={() => {
                if (node.isGuideMock) return;
                setTransferTarget(node);
              }}
            >
              {p('tree.transferUd3')}
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
            listNodes.map((n, i) => <TreeNodeCard key={n.id} node={n} index={i} />)
          )}
        </div>
      </div>

      {transferTarget && onTransferUd3 && (
        <PartnerUd3TransferModal
          open={Boolean(transferTarget)}
          onClose={() => setTransferTarget(null)}
          lang={lang}
          isDark={isDark}
          toAddress={transferTarget.address}
          levelLabel={(() => {
            const s = resolveUd3SLevel({
              totalPerfUsdt: transferTarget.teamUsd,
              smallAreaPerfUsdt: computePartnerAreaStats(nodes, transferTarget.id).smallAreaUsd,
            });
            const t = s ? UD3_TIERS[s.id - 1] : null;
            return t ? `${t.label} · ${t.ratePct}%` : p('ud3.tierNone');
          })()}
          layerLabel={
            transferTarget.isDirect
              ? p('tree.direct')
              : layerDepthLabel(partnerTeamDepth(nodes, transferTarget.id), p)
          }
          recipientIsDirect={transferTarget.isDirect}
          toAlias={getTeamAlias(aliases, transferTarget.address) || undefined}
          transferQuota={transferQuota}
          onConfirm={(amount) => onTransferUd3(transferTarget.address, amount)}
        />
      )}
    </div>
  );
}
