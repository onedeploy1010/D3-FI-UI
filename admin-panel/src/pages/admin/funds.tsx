import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { fmtUsd, shortAddr } from '@/lib/supabase';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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

const TYPE_LABEL: Record<string, string> = {
  gas: 'Gas 钱包',
  treasury: '金库钱包',
  flash_swap: '闪兑钱包',
  settlement: '清算钱包',
};

const TYPE_COLOR: Record<string, string> = {
  gas: 'bg-amber-500/15 text-amber-500',
  treasury: 'bg-emerald-500/15 text-emerald-500',
  flash_swap: 'bg-fuchsia-500/15 text-fuchsia-500',
  settlement: 'bg-sky-500/15 text-sky-500',
};

export default function FundsPage() {
  const [data, setData] = useState<WalletsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genCount, setGenCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void adminFetch<WalletsResp>('/wallets')
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generatePool = useCallback(async () => {
    setGenerating(true);
    setMsg(null);
    try {
      const r = await adminFetch<{ ok: boolean; created: number }>('/wallets/deposit-pool', {
        method: 'POST',
        body: JSON.stringify({ count: genCount }),
      });
      setMsg(`已生成 ${r.created} 个 deposit 钱包`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [genCount, load]);

  const totalUsdt = (data?.wallets ?? []).reduce((s, w) => s + w.usdt, 0);
  const totalBnb = (data?.wallets ?? []).reduce((s, w) => s + w.bnb, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet size={20} /> 资金管理
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turnkey 钱包余额 · 一键生成 deposit 钱包池 · 金库转账（多签申请）
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 刷新
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">运营钱包 USDT 合计</div>
          <div className="text-2xl font-bold text-emerald-500 mt-1">${fmtUsd(totalUsdt, 4)}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">运营钱包 BNB 合计（Gas）</div>
          <div className="text-2xl font-bold text-amber-500 mt-1">{fmtUsd(totalBnb, 6)} BNB</div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Wallet balances */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>地址</TableHead>
              <TableHead className="text-right">USDT</TableHead>
              <TableHead className="text-right">BNB (Gas)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.wallets ?? []).map((w) => (
              <TableRow key={w.address}>
                <TableCell>
                  <Badge className={TYPE_COLOR[w.walletType] ?? ''}>
                    {TYPE_LABEL[w.walletType] ?? w.walletType}
                  </Badge>
                  {w.label && <span className="ml-2 text-[10px] text-muted-foreground">{w.label}</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">{shortAddr(w.address)}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">${fmtUsd(w.usdt, 4)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtUsd(w.bnb, 6)}
                </TableCell>
              </TableRow>
            ))}
            {!loading && (data?.wallets ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  无钱包数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Deposit pool */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Deposit 钱包池</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              当前 <span className="font-bold text-foreground">{data?.depositCount ?? 0}</span> 个入金地址
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              value={genCount}
              onChange={(e) => setGenCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              className="w-20 px-2 py-1.5 text-sm rounded-lg border border-border bg-transparent"
            />
            <button
              onClick={generatePool}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : null} 一键生成
            </button>
          </div>
        </div>
        {msg && <p className="text-xs text-emerald-500">{msg}</p>}
      </div>

      {/* Treasury transfer (multisig) */}
      <div className="rounded-xl border border-dashed border-border p-4">
        <h2 className="text-sm font-bold">金库转账（多签申请）</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          金库钱包由 <b>2/3 多签</b>保护，转账需发起签名请求后由 3 位签署人中的 2 位在 Turnkey 面板确认。
          当前 Turnkey <b>签名额度已用尽</b>（Signing over quota）——升级 Turnkey 付费计划后即可发起金库转账、闪兑兑付与归集。
        </p>
      </div>
    </div>
  );
}
