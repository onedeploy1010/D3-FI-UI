import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AddressChip } from './address-chip';
import { getReferralTree, type ReferralTreeNode } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { cn } from '@/lib/utils';

function LevelBadge({ prefix, value }: { prefix: string; value: string | null }) {
  if (!value) return null;
  const label = value.toUpperCase().startsWith(prefix) ? value.toUpperCase() : `${prefix}${value}`;
  return (
    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
      {label}
    </Badge>
  );
}

function Node({ node, depth }: { node: ReferralTreeNode; depth: number }) {
  // Collapse everything but the root by default.
  const [open, setOpen] = useState(depth === 0);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;

  return (
    <div className={cn(depth > 0 && 'border-l border-border/60 pl-3 ml-1.5')}>
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
        </div>
        <div className="ml-6 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>直推 <b className="text-foreground">{node.directCount}</b></span>
          <span>团队 <b className="text-foreground">{node.teamCount}</b></span>
          <span>大区 <b className="text-foreground">${fmtUsd(node.bigAreaPerfUsdt)}</b></span>
          <span>小区 <b className="text-foreground">${fmtUsd(node.smallAreaPerfUsdt)}</b></span>
        </div>
      </div>
      {hasChildren && open && (
        <div className="space-y-0.5">
          {children.map((child) => (
            <Node key={child.wallet} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReferralTree({ root, depth = 3 }: { root: string; depth?: number }) {
  const [tree, setTree] = useState<ReferralTreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReferralTree(root, depth)
      .then((r) => !cancelled && setTree(r.root))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [root, depth]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" style={{ marginLeft: `${i * 12}px` }} />
        ))}
      </div>
    );
  }
  if (error) return <p className="py-6 text-center text-sm text-destructive">{error}</p>;
  if (!tree) return <p className="py-6 text-center text-sm text-muted-foreground">暂无推荐数据</p>;

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-3 overflow-x-auto">
      <Node node={tree} depth={0} />
    </div>
  );
}
