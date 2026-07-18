import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, CornerDownRight, ArrowLeft, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressChip } from './address-chip';
import { getReferralTree, type ReferralTreeNode } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// How many levels (from the current focus root) are auto-expanded. Deeper levels
// stay collapsed so a wide umbrella never floods the mobile viewport; the admin
// drills past this with the 深入 button (re-roots left) instead of endless indent.
const AUTO_OPEN_LEVELS = 3;

function shortAddr(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

function LevelBadge({ prefix, value }: { prefix: string; value: string | null }) {
  if (!value) return null;
  const label = value.toUpperCase().startsWith(prefix) ? value.toUpperCase() : `${prefix}${value}`;
  return (
    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
      {label}
    </Badge>
  );
}

function Node({
  node,
  depth,
  onFocus,
}: {
  node: ReferralTreeNode;
  depth: number;
  onFocus: (wallet: string) => void;
}) {
  // Auto-open the first AUTO_OPEN_LEVELS levels; collapse deeper ones by default.
  const [open, setOpen] = useState(depth < AUTO_OPEN_LEVELS - 1);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  // A depth-capped leaf that still has downline the server did not send → the only
  // way further down is to re-root here (infinite drill).
  const hasHiddenDownline = !hasChildren && node.directCount > 0;
  // The focus (depth 0) is already this subtree's root — no self-drill button.
  const canDrill = depth > 0 && node.directCount > 0;

  return (
    <div className={cn(depth > 0 && 'border-l border-border/60 pl-2 ml-1 sm:pl-3 sm:ml-1.5')}>
      <div className="flex flex-col gap-1.5 rounded-lg py-2">
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label={open ? '收起' : '展开'}
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="inline-block h-5 w-5 shrink-0" />
          )}
          <AddressChip address={node.wallet} variant="compact" />
          {node.isPartner && (
            <Badge className="h-4 bg-[#E0568F]/15 px-1.5 text-[10px] text-[#E0568F] hover:bg-[#E0568F]/15">
              合伙人
            </Badge>
          )}
          <LevelBadge prefix="S" value={node.sLevel} />
          <LevelBadge prefix="V" value={node.vLevel} />
          {canDrill && (
            <button
              type="button"
              onClick={() => onFocus(node.wallet)}
              title="进入此用户的推荐树"
              aria-label="进入此用户的推荐树"
              className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
            >
              <CornerDownRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">深入</span>
            </button>
          )}
        </div>
        <div className="ml-6 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>直推 <b className="text-foreground">{node.directCount}</b></span>
          <span>团队 <b className="text-foreground">{node.teamCount}</b></span>
          <span>大区 <b className="text-foreground">${fmtUsd(node.bigAreaPerfUsdt)}</b></span>
          <span>小区 <b className="text-foreground">${fmtUsd(node.smallAreaPerfUsdt)}</b></span>
        </div>
        {hasHiddenDownline && (
          <button
            type="button"
            onClick={() => onFocus(node.wallet)}
            className="ml-6 mt-0.5 inline-flex w-fit items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15"
          >
            <CornerDownRight className="h-3.5 w-3.5" />
            深入查看下级（{node.directCount}）
          </button>
        )}
      </div>
      {hasChildren && open && (
        <div className="space-y-0.5">
          {children.map((child) => (
            <Node key={child.wallet} node={child} depth={depth + 1} onFocus={onFocus} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReferralTree({ root, depth = 3 }: { root: string; depth?: number }) {
  // Drill path from the picked root down to the current focus. Re-rooting pushes a
  // wallet here; the breadcrumb pops back up. Focus = last element.
  const [path, setPath] = useState<string[]>([root]);
  const [tree, setTree] = useState<ReferralTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset the drill path whenever the admin picks a different root wallet.
  useEffect(() => {
    setPath([root]);
  }, [root]);

  const focus = path[path.length - 1] ?? root;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReferralTree(focus, depth)
      .then((r) => !cancelled && setTree(r.root))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [focus, depth]);

  const drillTo = (wallet: string) => {
    setPath((p) => (p[p.length - 1]?.toLowerCase() === wallet.toLowerCase() ? p : [...p, wallet]));
  };
  const jumpTo = (index: number) => setPath((p) => p.slice(0, index + 1));

  const breadcrumb =
    path.length > 1 ? (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPath((p) => p.slice(0, -1))}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="返回上级"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          上级
        </button>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-0.5 text-xs">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {path.map((w, i) => (
            <Fragment key={`${w}:${i}`}>
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
              <button
                type="button"
                onClick={() => jumpTo(i)}
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 font-mono',
                  i === path.length - 1
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {shortAddr(w)}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    ) : null;

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" style={{ marginLeft: `${i * 12}px` }} />
        ))}
      </div>
    );
  } else if (error) {
    body = <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  } else if (!tree) {
    body = <p className="py-6 text-center text-sm text-muted-foreground">暂无推荐数据</p>;
  } else {
    body = <Node node={tree} depth={0} onFocus={drillTo} />;
  }

  return (
    <div className="space-y-2">
      {breadcrumb}
      <div className="rounded-xl border border-border/60 bg-card/30 p-3 overflow-x-auto">{body}</div>
    </div>
  );
}
