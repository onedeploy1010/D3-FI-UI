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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AddressChip } from './address-chip';
import { getMember, setMemberLeader, setMemberRemark, setMemberSubsidyRate, type MemberDetail } from '@/lib/adminApi';
import { useAdminAuth } from '@/contexts/admin-auth';
import { fmtUsd } from '@/lib/supabase';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { Crown, ShieldCheck } from 'lucide-react';

function isLeaderStatus(status: string | null | undefined): boolean {
  return status === 'approved' || status === 'leader' || status === 'active';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LevelBadge({ prefix, value }: { prefix: string; value: string | null }) {
  if (!value) return null;
  const label = value.toUpperCase().startsWith(prefix) ? value.toUpperCase() : `${prefix}${value}`;
  return <Badge variant="secondary" className="font-semibold">{label}</Badge>;
}

function DialogBody({ wallet, onClose }: { wallet: string; onClose: () => void }) {
  const [data, setData] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Remark editing.
  const [remark, setRemark] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);

  // Leader maker-checker prompt.
  const [leaderTarget, setLeaderTarget] = useState<boolean | null>(null);
  const [leaderReason, setLeaderReason] = useState('');
  const [submittingLeader, setSubmittingLeader] = useState(false);

  // Per-member subsidy-rate override (needs `subsidies.rates`).
  const { hasPermission } = useAdminAuth();
  const canEditRate = hasPermission('subsidies.rates');
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMember(wallet)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setRemark(d.profile.remark ?? '');
        setRateInput(d.subsidyRatePct == null ? '' : String(d.subsidyRatePct));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  async function saveRemark() {
    setSavingRemark(true);
    try {
      await setMemberRemark(wallet, remark.trim());
      toast.success('备注已保存');
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, remark: remark.trim() } } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingRemark(false);
    }
  }

  async function saveRate() {
    const trimmed = rateInput.trim();
    const ratePct = trimmed === '' ? null : Number(trimmed);
    if (ratePct != null && (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100)) {
      toast.error('补贴比例需为 0–100');
      return;
    }
    setSavingRate(true);
    try {
      await setMemberSubsidyRate(wallet, ratePct);
      toast.success(ratePct == null ? '已恢复默认补贴比例' : `补贴比例已设为 ${ratePct}%`);
      setData((prev) => (prev ? { ...prev, subsidyRatePct: ratePct } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingRate(false);
    }
  }

  async function submitLeader() {
    if (leaderTarget == null) return;
    if (!leaderReason.trim()) {
      toast.error('请填写理由');
      return;
    }
    setSubmittingLeader(true);
    try {
      await setMemberLeader(wallet, leaderTarget, leaderReason.trim());
      toast.success('已提交审批,需另一管理员批准');
      setLeaderTarget(null);
      setLeaderReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmittingLeader(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-destructive">{error}</p>;
  }
  if (!data) return null;

  const currentlyLeader = isLeaderStatus(data.marketLeaderStatus);
  const pendingLeader = leaderTarget != null ? leaderTarget : currentlyLeader;
  const r = data.referral;

  return (
    <div className="space-y-6">
      {/* Identity */}
      <Section title="钱包地址 Wallet">
        <div className="flex flex-col gap-2">
          <AddressChip address={data.wallet} variant="full" clickable={false} className="w-full bg-transparent px-0" />
          <div className="flex flex-wrap items-center gap-2">
            {data.profile.displayName && (
              <span className="text-sm font-semibold">{data.profile.displayName}</span>
            )}
            {data.isPartner && (
              <Badge className="gap-1 bg-[#E0568F]/15 text-[#E0568F] hover:bg-[#E0568F]/15">
                <ShieldCheck className="h-3 w-3" /> 合伙人
              </Badge>
            )}
            {currentlyLeader && (
              <Badge variant="outline" className="gap-1">
                <Crown className="h-3 w-3" /> 市场领袖
              </Badge>
            )}
            <LevelBadge prefix="S" value={r.sLevel} />
            <LevelBadge prefix="V" value={r.vLevel} />
          </div>
        </div>
      </Section>

      <Separator />

      {/* Remark */}
      <Section title="备注 Remark">
        <Textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="为该会员添加内部备注…"
          rows={2}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={saveRemark} disabled={savingRemark || remark === (data.profile.remark ?? '')}>
            {savingRemark ? '保存中…' : '保存备注'}
          </Button>
        </div>
      </Section>

      {/* Leader toggle (maker-checker) */}
      <Section title="市场领袖 Leader">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 p-3">
          <div>
            <p className="text-sm font-medium">设为市场领袖</p>
            <p className="text-[11px] text-muted-foreground">变更需另一管理员审批</p>
          </div>
          <Switch
            checked={pendingLeader}
            onCheckedChange={(next) => {
              if (next === currentlyLeader) {
                setLeaderTarget(null);
                setLeaderReason('');
              } else {
                setLeaderTarget(next);
              }
            }}
          />
        </div>
        {leaderTarget != null && (
          <div className="space-y-2 rounded-xl border border-[#E0568F]/30 bg-[#E0568F]/5 p-3">
            <p className="text-xs font-medium">
              {leaderTarget ? '申请设为市场领袖' : '申请取消市场领袖'} — 请填写理由
            </p>
            <Textarea
              value={leaderReason}
              onChange={(e) => setLeaderReason(e.target.value)}
              placeholder="变更理由(将记录于审批流)"
              rows={2}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLeaderTarget(null);
                  setLeaderReason('');
                }}
              >
                取消
              </Button>
              <Button size="sm" onClick={submitLeader} disabled={submittingLeader}>
                {submittingLeader ? '提交中…' : '提交审批'}
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* Per-member subsidy rate (needs subsidies.rates permission) */}
      {canEditRate && (
        <Section title="补贴比例 Subsidy %">
          <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">
                单独设置该会员补贴比例（留空 = 默认 10%）。当前：
                {data.subsidyRatePct == null ? ' 默认 10%' : ` ${data.subsidyRatePct}%`}
              </p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="默认 10"
                  className="h-9 w-28"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={saveRate}
              disabled={savingRate || rateInput.trim() === (data.subsidyRatePct == null ? '' : String(data.subsidyRatePct))}
            >
              {savingRate ? '保存中…' : '保存'}
            </Button>
          </div>
        </Section>
      )}

      <Separator />

      {/* Team overview */}
      <Section title="团队概览 Team">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="直推人数" value={r.directCount.toLocaleString()} />
          <Stat label="团队人数" value={r.teamCount.toLocaleString()} />
          <Stat label="大区业绩" value={`$${fmtUsd(r.bigAreaPerfUsdt)}`} />
          <Stat label="小区业绩" value={`$${fmtUsd(r.smallAreaPerfUsdt)}`} />
        </div>
        {r.sponsorWallet && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">推荐人</span>
            <AddressChip address={r.sponsorWallet} variant="compact" />
          </div>
        )}
      </Section>

      {/* Stake + balances */}
      <Section title="质押与余额 Stakes & Balances">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="质押笔数"
            value={data.stakeSummary.count.toLocaleString()}
            hint={`活跃 ${data.stakeSummary.activeCount}`}
          />
          <Stat label="USDT 本金" value={`$${fmtUsd(data.stakeSummary.usdtPrincipal)}`} />
          <Stat label="UD3 本金" value={`${fmtUsd(data.stakeSummary.ud3Principal, 4)} UD3`} />
          <Stat label="UD3 余额" value={`${fmtUsd(data.balances.ud3Balance, 4)} UD3`} />
          <Stat label="待发 UD3" value={`${fmtUsd(data.balances.pendingUd3, 4)} UD3`} />
          <Stat label="待发 D3 收益" value={`${fmtUsd(data.balances.pendingD3Yield, 4)} D3`} />
        </div>
      </Section>

      <div className="flex justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}

/**
 * Member detail modal. Kept the `{ wallet, onClose }` controlled signature so
 * existing pages (members/partners) and the global MemberDialogProvider can
 * both drive it. Desktop → Dialog; mobile → bottom Drawer for a native feel.
 */
export function MemberDetailDialog({
  wallet,
  onClose,
}: {
  wallet: string | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const openState = Boolean(wallet);

  if (isMobile) {
    return (
      <Drawer open={openState} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="text-sm">会员详情</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            {wallet && <DialogBody wallet={wallet} onClose={onClose} />}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={openState} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">会员详情 Member Detail</DialogTitle>
        </DialogHeader>
        {wallet && <DialogBody wallet={wallet} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
