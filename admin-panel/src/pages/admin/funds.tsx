import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Fuel,
  Loader2,
  Landmark,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { fmtUsd } from '@/lib/supabase';
import { isAddress, toChecksumAddress } from '@/lib/address';
import { PageShell } from './page-shell';
import { AddressChip } from '@/components/address-chip';
import { DataList, type DataListColumn, type DataListFilter } from '@/components/data-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types (mirror the admin backend row shapes — nothing invented) ──

type InfraWallet = {
  walletType: string;
  label: string | null;
  address: string;
  status: string;
  bnb: number;
  usdt: number;
};

type WalletsResp = {
  ok: boolean;
  wallets: InfraWallet[];
  depositCount: number;
  usdtContract: string;
};

type TreasuryTransfer = {
  id: string;
  asset: string;
  to_address: string;
  amount: number;
  status: string;
  turnkey_activity_id: string | null;
  tx_hash: string | null;
  note: string | null;
  error: string | null;
  created_at: string;
  broadcast_at: string | null;
  proposed_by: string | null;
  request_key: string | null;
};

type AllowlistEntry = {
  address: string;
  label: string | null;
  added_by: string | null;
  created_at: string;
};

type TransferAsset = 'usdt' | 'bnb';

// ── Presentation maps ──

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_consensus: { label: '等待多签', cls: 'bg-amber-500/15 text-amber-500' },
  submitted: { label: '已提交', cls: 'bg-sky-500/15 text-sky-500' },
  broadcast: { label: '已广播', cls: 'bg-indigo-500/15 text-indigo-500' },
  confirmed: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-500' },
  failed: { label: '失败', cls: 'bg-red-500/15 text-red-500' },
};

const WALLET_META: Record<
  string,
  { label: string; hint: string; icon: typeof Wallet; tone: string; ring: string }
> = {
  treasury: {
    label: '金库钱包',
    hint: '2/3 多签 · UD3 兑付储备',
    icon: Landmark,
    tone: 'text-emerald-500',
    ring: 'ring-emerald-500/25',
  },
  settlement: {
    label: '清算钱包',
    hint: '入金归集与结算',
    icon: Coins,
    tone: 'text-sky-500',
    ring: 'ring-sky-500/25',
  },
  gas: {
    label: 'Gas 钱包',
    hint: '链上手续费储备',
    icon: Fuel,
    tone: 'text-amber-500',
    ring: 'ring-amber-500/25',
  },
  flash_swap: {
    label: '闪兑钱包',
    hint: 'UD3 闪兑流动性',
    icon: Zap,
    tone: 'text-fuchsia-500',
    ring: 'ring-fuchsia-500/25',
  },
};

function walletMeta(type: string) {
  return (
    WALLET_META[type] ?? {
      label: type,
      hint: '',
      icon: Wallet,
      tone: 'text-foreground',
      ring: 'ring-border',
    }
  );
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return String(iso).replace('T', ' ').slice(0, 19);
}

function StatusBadge({ status }: { status: string }) {
  const meta = TRANSFER_STATUS[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <Badge className={meta.cls}>{meta.label}</Badge>;
}

// ── Wallet overview cards ──

function WalletCard({ w }: { w: InfraWallet }) {
  const meta = walletMeta(w.walletType);
  const Icon = meta.icon;
  return (
    <Card className={cn('overflow-hidden ring-1 ring-inset', meta.ring)}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/50', meta.tone)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-bold leading-tight">{meta.label}</CardTitle>
            <p className="truncate text-[10px] text-muted-foreground">{w.label || meta.hint}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            w.status === 'active' ? 'text-emerald-500' : 'text-muted-foreground',
          )}
        >
          {w.status === 'active' ? '正常' : w.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">USDT</div>
            <div className={cn('text-xl font-black tabular-nums', meta.tone)}>${fmtUsd(w.usdt, 2)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">BNB (Gas)</div>
            <div className="text-sm font-semibold tabular-nums text-muted-foreground">{fmtUsd(w.bnb, 6)}</div>
          </div>
        </div>
        <AddressChip address={w.address} variant="compact" className="max-w-full" />
      </CardContent>
    </Card>
  );
}

// ── Stepper ──

const STEPS = ['填写', '风险确认', '提交'];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex flex-1 items-center gap-1">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors',
                  done && 'bg-emerald-500 text-white',
                  active && 'bg-primary text-primary-foreground',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('mx-1 h-px flex-1', done ? 'bg-emerald-500/50' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Treasury transfer wizard ──

function TransferWizard({
  open,
  onOpenChange,
  allowlist,
  allowlistAvailable,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowlist: AllowlistEntry[];
  allowlistAvailable: boolean;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState(0);
  const [asset, setAsset] = useState<TransferAsset>('usdt');
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Idempotency key stays stable for the life of one wizard session so a
  // double-submit dedupes on the backend.
  const requestKey = useRef<string>('');

  const reset = useCallback(() => {
    setStep(0);
    setAsset('usdt');
    setAmount('');
    setDest('');
    setNote('');
    setError(null);
    setSubmitting(false);
    requestKey.current = '';
  }, []);

  useEffect(() => {
    if (open) requestKey.current = crypto.randomUUID();
    else reset();
  }, [open, reset]);

  const destChecksum = isAddress(dest) ? toChecksumAddress(dest.trim()) : dest.trim();
  const amountNum = Number(amount);

  const validateStep1 = (): boolean => {
    if (!isAddress(dest.trim())) {
      setError('请选择或输入有效的收款地址（0x…40 位）');
      return false;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('请输入大于 0 的转账金额');
      return false;
    }
    setError(null);
    return true;
  };

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await adminFetch<{ transfer: TreasuryTransfer }>('/treasury/transfers', {
        method: 'POST',
        body: JSON.stringify({
          asset,
          toAddress: destChecksum,
          amount: amountNum,
          requestKey: requestKey.current,
          note: note.trim() || undefined,
        }),
      });
      toast.success('已发起金库转账申请，等待另一位管理员批准后广播');
      onOpenChange(false);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起转账失败');
    } finally {
      setSubmitting(false);
    }
  }, [asset, destChecksum, amountNum, note, onOpenChange, onSubmitted]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> 金库转账
          </DialogTitle>
          <DialogDescription>
            金库钱包由 <b>2/3 多签</b> 保护。申请由你发起，需 <b>另一位管理员批准后广播</b>（双人复核）。
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Stepper step={step} />
        </div>

        {/* Step 1 — details */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>资产</Label>
                <Select value={asset} onValueChange={(v) => setAsset(v as TransferAsset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usdt">USDT</SelectItem>
                    <SelectItem value="bnb">BNB (Gas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>金额</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>收款地址</Label>
                {!allowlistAvailable && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    白名单待后端
                  </Badge>
                )}
              </div>
              {allowlistAvailable && allowlist.length > 0 ? (
                <Select value={isAddress(dest) ? destChecksum : ''} onValueChange={setDest}>
                  <SelectTrigger>
                    <SelectValue placeholder="从白名单选择收款地址" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowlist.map((a) => (
                      <SelectItem key={a.address} value={toChecksumAddress(a.address)}>
                        <span className="flex flex-col text-left">
                          <span className="font-medium">{a.label || '未命名地址'}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {a.address.slice(0, 10)}…{a.address.slice(-6)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    placeholder="0x…"
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {allowlistAvailable
                      ? '白名单为空，请在后台先添加收款地址，或直接输入地址。'
                      : '白名单接口尚未接入，暂时手动输入收款地址。'}
                  </p>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>备注（可选）</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="用途说明"
                rows={2}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button
                onClick={() => {
                  if (validateStep1()) setStep(1);
                }}
              >
                下一步 <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — risk confirmation */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">资产</dt>
                  <dd className="font-semibold">{asset.toUpperCase()}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">金额</dt>
                  <dd className="text-lg font-black tabular-nums text-emerald-500">
                    {fmtUsd(amountNum, asset === 'bnb' ? 6 : 2)} {asset.toUpperCase()}
                  </dd>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 pt-1 text-muted-foreground">收款地址</dt>
                  <dd className="min-w-0">
                    <AddressChip address={destChecksum} clickable={false} />
                  </dd>
                </div>
                {note.trim() && (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">备注</dt>
                    <dd className="min-w-0 text-right">{note.trim()}</dd>
                  </div>
                )}
              </dl>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>请再次核对</AlertTitle>
              <AlertDescription className="space-y-1 text-xs leading-relaxed">
                <p>· 转账受单笔 / 单日限额约束，超额会被后端拒绝。</p>
                <p>· 金库储备用于 UD3 兑付，请预留充足余额。</p>
                <p>· 提交后生成 Turnkey 多签请求，需另一位管理员批准后方可广播上链。</p>
                <p>· 地址一经上链不可撤回，务必核对收款地址。</p>
              </AlertDescription>
            </Alert>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft className="h-4 w-4" /> 返回
              </Button>
              <Button onClick={() => setStep(2)}>
                确认无误 <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — submit */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-6 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold">提交多签申请</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                即将向 Turnkey 提交
                <b className="text-foreground">
                  {' '}
                  {fmtUsd(amountNum, asset === 'bnb' ? 6 : 2)} {asset.toUpperCase()}{' '}
                </b>
                的签名请求。提交后请通知另一位管理员在转账记录中完成
                <b className="text-foreground"> 批准并广播</b>。
              </p>
            </div>

            {error && <p className="text-center text-sm text-red-500">{error}</p>}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" disabled={submitting} onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" /> 返回
              </Button>
              <Button disabled={submitting} onClick={submit}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                提交申请
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──

export default function FundsPage() {
  const [data, setData] = useState<WalletsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transfers, setTransfers] = useState<TreasuryTransfer[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistAvailable, setAllowlistAvailable] = useState(true);

  const [genCount, setGenCount] = useState(10);
  const [generating, setGenerating] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);

  const loadTransfers = useCallback(() => {
    void adminFetch<{ transfers: TreasuryTransfer[] }>('/treasury/transfers')
      .then((r) => setTransfers(r.transfers ?? []))
      .catch(() => {
        /* non-fatal — the wallet view still renders */
      });
  }, []);

  const loadAllowlist = useCallback(() => {
    void adminFetch<{ rows: AllowlistEntry[] }>('/treasury/allowlist')
      .then((r) => {
        setAllowlist(r.rows ?? []);
        setAllowlistAvailable(true);
      })
      .catch(() => {
        // Feature-detect: backend not deployed yet → degrade gracefully.
        setAllowlistAvailable(false);
        setAllowlist([]);
      });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminFetch<WalletsResp>('/wallets')
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
    loadTransfers();
    loadAllowlist();
  }, [loadTransfers, loadAllowlist]);

  useEffect(() => {
    load();
  }, [load]);

  const broadcastTransfer = useCallback(
    async (id: string) => {
      setBroadcastingId(id);
      try {
        const r = await adminFetch<{ transfer: TreasuryTransfer }>(
          `/treasury/transfers/${id}/broadcast`,
          { method: 'POST' },
        );
        if (r.transfer.status === 'confirmed') {
          toast.success('多签已批准，转账已广播上链');
        } else {
          toast.error(r.transfer.error ?? '多签尚未批准，请稍后再试');
        }
        loadTransfers();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '广播失败');
      } finally {
        setBroadcastingId(null);
      }
    },
    [loadTransfers],
  );

  const generatePool = useCallback(async () => {
    setGenerating(true);
    try {
      const r = await adminFetch<{ ok: boolean; created: number }>('/wallets/deposit-pool', {
        method: 'POST',
        body: JSON.stringify({ count: genCount }),
      });
      toast.success(`已生成 ${r.created} 个 deposit 钱包`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [genCount, load]);

  const wallets = data?.wallets ?? [];
  const totalUsdt = wallets.reduce((s, w) => s + w.usdt, 0);
  const totalBnb = wallets.reduce((s, w) => s + w.bnb, 0);

  // Status filter options present in the current transfer set.
  const transferFilters = useMemo<DataListFilter[]>(() => {
    const seen = new Set(transfers.map((t) => t.status).filter(Boolean));
    if (seen.size === 0) return [];
    return [
      {
        key: 'status',
        label: '状态',
        options: [...seen].map((s) => ({ value: s, label: TRANSFER_STATUS[s]?.label ?? s })),
      },
    ];
  }, [transfers]);

  const transferColumns = useMemo<DataListColumn<TreasuryTransfer>[]>(
    () => [
      {
        key: 'asset',
        label: '资产',
        render: (t) => <Badge variant="outline">{t.asset.toUpperCase()}</Badge>,
      },
      {
        key: 'amount',
        label: '金额',
        sortable: true,
        className: 'text-right tabular-nums',
        render: (t) => `${fmtUsd(t.amount, t.asset === 'bnb' ? 6 : 2)} ${t.asset.toUpperCase()}`,
      },
      {
        key: 'to_address',
        label: '收款地址',
        render: (t) => <AddressChip address={t.to_address} variant="compact" clickable={false} />,
      },
      {
        key: 'status',
        label: '状态',
        render: (t) => <StatusBadge status={t.status} />,
      },
      {
        key: 'proposed_by',
        label: '发起人',
        mobileHide: true,
        render: (t) =>
          t.proposed_by ? (
            <span className="font-mono text-xs text-muted-foreground">
              {t.proposed_by.slice(0, 8)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: 'created_at',
        label: '时间',
        sortable: true,
        className: 'whitespace-nowrap text-xs text-muted-foreground',
        render: (t) => fmtTime(t.created_at),
      },
    ],
    [],
  );

  return (
    <PageShell
      title="资金管理"
      subtitle="Treasury · 基础设施钱包余额 · 金库转账（2/3 多签 · 双人复核）"
      actions={
        <>
          <Button variant="outline" size="sm" disabled={loading} onClick={load}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Send className="h-4 w-4" /> 金库转账
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                运营钱包 USDT 合计
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-emerald-500">
                ${fmtUsd(totalUsdt, 2)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                运营钱包 BNB 合计（Gas）
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums text-amber-500">
                {fmtUsd(totalBnb, 6)} BNB
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Wallet overview */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Wallet className="h-4 w-4" /> 钱包概览
          </h2>
          {loading && wallets.length === 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="h-[150px] animate-pulse bg-muted/20" />
              ))}
            </div>
          ) : wallets.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                无钱包数据
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {wallets.map((w) => (
                <WalletCard key={w.address} w={w} />
              ))}
              {/* Deposit pool tile */}
              <Card className="ring-1 ring-inset ring-border">
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted/50 text-primary">
                      <Users className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-bold leading-tight">Deposit 钱包池</CardTitle>
                      <p className="text-[10px] text-muted-foreground">HD 派生入金地址</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      入金地址数
                    </div>
                    <div className="text-2xl font-black tabular-nums">{data?.depositCount ?? 0}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={genCount}
                      onChange={(e) =>
                        setGenCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))
                      }
                      className="h-8 w-16 tabular-nums"
                    />
                    <Button size="sm" disabled={generating} onClick={generatePool}>
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      一键生成
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        {/* Transfer records */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Send className="h-4 w-4" /> 转账记录
            </h2>
            <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
              <Send className="h-4 w-4" /> 发起转账
            </Button>
          </div>

          <DataList<TreasuryTransfer>
            columns={transferColumns}
            rows={transfers}
            getRowId={(t) => t.id}
            searchKeys={['to_address', 'note', 'asset']}
            searchPlaceholder="搜索收款地址 / 备注…"
            filters={transferFilters}
            dateKey="created_at"
            emptyText="暂无金库转账记录"
            renderExpanded={(t) => {
              const canBroadcast = t.status === 'awaiting_consensus' || t.status === 'broadcast';
              return (
                <div className="space-y-3 py-1">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                    <DetailRow label="资产 / 金额">
                      {fmtUsd(t.amount, t.asset === 'bnb' ? 6 : 2)} {t.asset.toUpperCase()}
                    </DetailRow>
                    <DetailRow label="状态">
                      <StatusBadge status={t.status} />
                    </DetailRow>
                    <DetailRow label="收款地址">
                      <AddressChip address={t.to_address} clickable={false} />
                    </DetailRow>
                    <DetailRow label="交易哈希">
                      {t.tx_hash ? (
                        <AddressChip txHash={t.tx_hash} variant="compact" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DetailRow>
                    <DetailRow label="发起人">
                      <span className="font-mono">{t.proposed_by ?? '—'}</span>
                    </DetailRow>
                    <DetailRow label="Turnkey 活动">
                      <span className="font-mono">{t.turnkey_activity_id ?? '—'}</span>
                    </DetailRow>
                    <DetailRow label="发起时间">{fmtTime(t.created_at)}</DetailRow>
                    <DetailRow label="广播时间">{fmtTime(t.broadcast_at)}</DetailRow>
                    {t.note && <DetailRow label="备注">{t.note}</DetailRow>}
                    {t.error && (
                      <DetailRow label="错误">
                        <span className="text-red-500">{t.error}</span>
                      </DetailRow>
                    )}
                  </dl>
                  {canBroadcast && (
                    <div className="flex items-center gap-2 border-t border-border/50 pt-3">
                      <p className="flex-1 text-[11px] text-muted-foreground">
                        需由 <b>另一位管理员</b>（非发起人）在 Turnkey 完成 2/3 批准后广播。
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={broadcastingId === t.id}
                        onClick={() => broadcastTransfer(t.id)}
                      >
                        {broadcastingId === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        批准并广播
                      </Button>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </section>
      </div>

      <TransferWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        allowlist={allowlist}
        allowlistAvailable={allowlistAvailable}
        onSubmitted={loadTransfers}
      />
    </PageShell>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
