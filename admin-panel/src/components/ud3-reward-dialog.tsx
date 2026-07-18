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
import { getOrderUd3Reward, type OrderUd3Reward, type Ud3RewardTier } from '@/lib/adminApi';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * 反向金 (UD3) reward-distribution audit view for a single stake order — V3 model
 * ("档位系数 × 累计权益级差"). Backend endpoint: GET /orders/:intentId/ud3-reward.
 *
 * The 网体 (network) reward is split across SIX fixed tier slots S1..S6; each slot
 * is either 已计算 (CALCULATED — paid to the nearest qualified + eligible up-chain
 * ancestor) or 未分配 (UNALLOCATED). The 引路人 (guide) reward is an independent
 * ladder. The tier table always renders all six rows.
 *
 * All amounts / rates come from the API as strings to preserve numeric(…)
 * precision — we format straight from the string and never round-trip UD3 amounts
 * through Number(). Rates are small enough that Number() is safe there.
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

/** Human 层级 label: relationDepth 2 → '第2代'. */
function fmtDepth(v: number | null | undefined): string {
  return v != null ? `第${v}代` : '—';
}

const UNALLOCATED_REASON_LABEL: Record<string, string> = {
  NO_QUALIFIED_ANCESTOR: '无符合档位的上级',
  EMPTY_REFERRAL_CHAIN: '无推荐链',
  ALL_MATCHED_USERS_INELIGIBLE: '符合档位但无资格',
};

function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return '销毁';
  return UNALLOCATED_REASON_LABEL[reason] ?? reason;
}

function TierStatusBadge({ status }: { status: Ud3RewardTier['status'] }) {
  if (status === 'CALCULATED') {
    return (
      <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">已计算</Badge>
    );
  }
  // 网体无合格上级 → 记录销毁 (BURN).
  return (
    <Badge className="border-transparent bg-rose-500/20 text-rose-400">销毁</Badge>
  );
}

function GuideStatusBadge({ status }: { status: string }) {
  const calculated = status === 'CALCULATED' || status === 'CREDITED' || status === 'REWARDED';
  const label =
    status === 'CREDITED' ? '已入账'
      : status === 'REWARDED' ? '已发放'
      : status === 'CALCULATED' ? '已计算'
      : status === 'UNALLOCATED' ? '未分配'
      : status ?? '—';
  return (
    <Badge
      className={cn(
        'border-transparent',
        calculated ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-secondary-foreground',
      )}
    >
      {label}
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
  const tiers = data.tiers ?? [];

  return (
    <div className="space-y-5">
      {/* 订单头 */}
      <Section title="订单信息 Order">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:grid-cols-3">
          <Field label="入金本金" value={`${fmtUd3(order.principalUsdt)} USDT`} />
          <Field label="网体基础比例" value={fmtPct(order.networkRatePct)} />
          <Field label="算法版本" value={<span className="text-[11px] break-all">{order.algorithmVersion ?? '—'}</span>} />
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
              档位 <span className="font-semibold text-foreground">{guide.tierCode ?? '—'}</span>
            </span>
            <span className="text-muted-foreground">
              系数 <span className="font-semibold tabular-nums text-foreground">{fmtPct(guide.coefficient)}</span>
            </span>
            <span className="font-semibold tabular-nums text-[#E0568F]">{fmtUd3(guide.amount)} UD3</span>
            <GuideStatusBadge status={guide.status} />
          </div>
        ) : (
          <p className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
            无引路人奖励
          </p>
        )}
      </Section>

      {/* 网体档位级差奖励 — S1..S6 */}
      <Section title="网体档位奖励 Network (S1–S6)">
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">档位</TableHead>
                <TableHead className="whitespace-nowrap text-right">系数</TableHead>
                <TableHead className="whitespace-nowrap text-right">累计权益</TableHead>
                <TableHead className="whitespace-nowrap text-right">本档新增</TableHead>
                <TableHead className="whitespace-nowrap text-right">金额 UD3</TableHead>
                <TableHead className="whitespace-nowrap">状态</TableHead>
                <TableHead className="whitespace-nowrap">接收人</TableHead>
                <TableHead className="whitespace-nowrap">接收人档位</TableHead>
                <TableHead className="whitespace-nowrap">层级</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((t) => {
                const burned = t.status !== 'CALCULATED';
                return (
                  <TableRow key={t.rewardTierCode} className={cn(burned && 'text-muted-foreground')}>
                    <TableCell className="whitespace-nowrap font-medium">{t.rewardTierCode}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {fmtPct(t.coefficient)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {fmtPct(t.cumulativeRate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {fmtPct(t.incrementalRate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {fmtUd3(t.amount)} UD3
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {burned ? (
                        <div className="flex flex-col gap-0.5">
                          <TierStatusBadge status={t.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {reasonLabel(t.unallocatedReason)}
                          </span>
                        </div>
                      ) : (
                        <TierStatusBadge status={t.status} />
                      )}
                    </TableCell>
                    <TableCell>
                      {burned ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <AddressChip address={t.receiverWallet} variant="compact" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {burned ? '—' : t.receiverTierCode ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {burned ? '—' : fmtDepth(t.receiverRelationDepth)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Separator />

      {/* 网体合计 + 守恒 */}
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
          <span className="text-muted-foreground">已分配</span>
          <span className="font-medium tabular-nums text-emerald-400">{fmtUd3(data.networkAllocatedUd3)} UD3</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">销毁</span>
          <span className="font-medium tabular-nums text-rose-400">{fmtUd3(data.networkBurnedUd3)} UD3</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            守恒校验
            {data.conserved ? (
              <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">守恒 ✓</Badge>
            ) : (
              <Badge className="border-transparent bg-destructive/20 text-destructive">不守恒 ⚠</Badge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">已分配 + 销毁 = 网体合计</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[10px] text-muted-foreground">
          {(data.algorithmVersion ?? order.algorithmVersion) && (
            <span>算法版本 {data.algorithmVersion ?? order.algorithmVersion}</span>
          )}
          {(data.configVersion ?? order.configVersion) && (
            <span>配置版本 {data.configVersion ?? order.configVersion}</span>
          )}
        </div>
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
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        {open && intentId && <DialogBody intentId={intentId} />}
      </DialogContent>
    </Dialog>
  );
}
