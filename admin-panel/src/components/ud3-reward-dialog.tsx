import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AddressChip } from './address-chip';
import { getOrderUd3Reward, type OrderUd3Reward } from '@/lib/adminApi';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Flame } from 'lucide-react';

/**
 * 反向金 (UD3) reward-distribution audit view for a single stake order.
 * Backend endpoint: GET /orders/:intentId/ud3-reward.
 *
 * All amounts / rates come from the API as strings to preserve numeric(24,6)
 * precision — we format straight from the string and never round-trip through
 * Number() for UD3 amounts. Rates are small enough that Number() is safe there.
 */

/** Decimal string like '0.20' → '20%', '1.5' → '150%'. Never '0.2%'. */
function fmtPct(v: string | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // toFixed(4) then trim absorbs float noise (0.2*100 = 20.000000000000004).
  const s = (n * 100).toFixed(4).replace(/\.?0+$/, '');
  return `${s === '' || s === '-0' ? '0' : s}%`;
}

/** UD3 amount: up to 6 dp, trailing zeros trimmed, no scientific notation. */
function fmtUd3(v: string | null | undefined): string {
  if (v == null || v === '') return '0';
  const s = String(v).trim();
  if (!/^-?\d*\.?\d+$/.test(s)) return s; // non-numeric → show raw
  const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return trimmed === '' || trimmed === '-0' ? '0' : trimmed;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  REWARDED: { label: '已发放', className: 'bg-emerald-500/20 text-emerald-400' },
  CREDITED: { label: '已入账', className: 'bg-emerald-500/20 text-emerald-400' },
  NO_DIFFERENCE: { label: '无极差', className: 'bg-muted text-muted-foreground' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={cn('border-transparent', meta?.className ?? 'bg-secondary text-secondary-foreground')}>
      {meta?.label ?? status ?? '—'}
    </Badge>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-semibold tabular-nums break-words">{value}</div>
    </div>
  );
}

function DialogBody({ intentId }: { intentId: string }) {
  const [data, setData] = useState<OrderUd3Reward | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    getOrderUd3Reward(intentId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [intentId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  }

  if (!data || !data.found || !data.order) {
    return <p className="py-10 text-center text-sm text-muted-foreground">该订单暂无反向金记录</p>;
  }

  const { order, guide } = data;
  const network = data.network ?? [];

  return (
    <div className="space-y-5">
      {/* 订单头 */}
      <Section title="订单信息 Order">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:grid-cols-3">
          <Field label="入金金额" value={`${fmtUd3(order.principalUsdt)} USDT`} />
          <Field label="贿赂比例" value={fmtPct(order.bribeRatePct)} />
          <Field label="总贿赂金" value={`${fmtUd3(order.totalBribeUd3)} UD3`} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">入金人 Depositor</p>
            <div className="mt-0.5">
              <AddressChip address={order.depositorWallet} variant="compact" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">推荐人 Referrer</p>
            <div className="mt-0.5">
              <AddressChip address={order.referrerWallet} variant="compact" />
            </div>
          </div>
        </div>
      </Section>

      <Separator />

      {/* 引路人奖励 */}
      <Section title="引路人奖励 Guide">
        {guide ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-card/40 p-3 text-sm">
            <AddressChip address={guide.wallet} variant="compact" />
            <span className="text-muted-foreground">
              等级 <span className="font-semibold text-foreground">{guide.level ?? '—'}</span>
            </span>
            <span className="text-muted-foreground">
              权益 <span className="font-semibold tabular-nums text-foreground">{fmtPct(guide.levelRate)}</span>
            </span>
            <span className="font-semibold tabular-nums text-[#E0568F]">{fmtUd3(guide.amount)} UD3</span>
            <StatusBadge status={guide.status} />
          </div>
        ) : (
          <p className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
            无引路人奖励
          </p>
        )}
      </Section>

      {/* 网体极差奖励 */}
      <Section title="网体极差奖励 Network">
        {network.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
            无网体极差记录
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">层级</TableHead>
                  <TableHead className="whitespace-nowrap">钱包</TableHead>
                  <TableHead className="whitespace-nowrap">等级</TableHead>
                  <TableHead className="whitespace-nowrap text-right">累计权益</TableHead>
                  <TableHead className="whitespace-nowrap text-right">此前已释放</TableHead>
                  <TableHead className="whitespace-nowrap text-right">实际极差</TableHead>
                  <TableHead className="whitespace-nowrap text-right">金额 UD3</TableHead>
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {network.map((n, i) => {
                  const muted = n.status === 'NO_DIFFERENCE';
                  return (
                    <TableRow key={`${n.wallet ?? 'row'}-${i}`} className={cn(muted && 'text-muted-foreground')}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {n.relationDepth != null ? `第${n.relationDepth}层` : '—'}
                      </TableCell>
                      <TableCell>
                        <AddressChip address={n.wallet} variant="compact" />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{n.level ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtPct(n.cumulativeRate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtPct(n.previousReleasedRate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {fmtPct(n.differenceRate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {muted ? '0' : fmtUd3(n.amount)} UD3
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {muted ? (
                          <span className="text-[11px] text-muted-foreground">同级无极差 / 低于已释放档位</span>
                        ) : (
                          <StatusBadge status={n.status} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Separator />

      {/* 销毁数量 */}
      <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-amber-500">
          <Flame className="h-4 w-4" /> 销毁数量
        </span>
        <span className="text-sm font-bold tabular-nums text-amber-500">{fmtUd3(data.burnUd3)} UD3</span>
      </div>

      {/* 合计 + 守恒 */}
      <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">引路人</span>
          <span className="font-medium tabular-nums">{fmtUd3(guide?.amount)} UD3</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">网体合计</span>
          <span className="font-medium tabular-nums">{fmtUd3(data.networkTotalUd3)} UD3</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">销毁</span>
          <span className="font-medium tabular-nums">{fmtUd3(data.burnUd3)} UD3</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            合计
            {data.conserved ? (
              <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">守恒 ✓</Badge>
            ) : (
              <Badge className="border-transparent bg-destructive/20 text-destructive">不守恒 ⚠</Badge>
            )}
          </span>
          <span className="text-base font-bold tabular-nums text-[#E0568F]">{fmtUd3(data.totalUd3)} UD3</span>
        </div>
        {data.configVersion && (
          <p className="text-[10px] text-muted-foreground">配置版本 {data.configVersion}</p>
        )}
      </div>
    </div>
  );
}

export function Ud3RewardDialog({
  intentId,
  open,
  onOpenChange,
}: {
  intentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const title = '反向金分配 UD3 Reward';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="text-sm">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            {open && intentId && <DialogBody intentId={intentId} />}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        {open && intentId && <DialogBody intentId={intentId} />}
      </DialogContent>
    </Dialog>
  );
}
