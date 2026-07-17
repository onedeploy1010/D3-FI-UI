import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { fmtUsd, shortAddr } from '@/lib/supabase';
import { Loader2, RefreshCw, Send, Wallet } from 'lucide-react';
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
};

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_consensus: { label: '等待多签', cls: 'bg-amber-500/15 text-amber-500' },
  submitted: { label: '已提交', cls: 'bg-sky-500/15 text-sky-500' },
  broadcast: { label: '已广播', cls: 'bg-indigo-500/15 text-indigo-500' },
  confirmed: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-500' },
  failed: { label: '失败', cls: 'bg-red-500/15 text-red-500' },
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

  // Treasury transfer form + request list.
  const [transfers, setTransfers] = useState<TreasuryTransfer[]>([]);
  const [txAsset, setTxAsset] = useState<'usdt' | 'bnb'>('usdt');
  const [txTo, setTxTo] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txMsg, setTxMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);

  const loadTransfers = useCallback(() => {
    void adminFetch<{ transfers: TreasuryTransfer[] }>('/treasury/transfers')
      .then((r) => setTransfers(r.transfers ?? []))
      .catch(() => {
        /* non-fatal — the wallet view still renders */
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
  }, [loadTransfers]);

  useEffect(() => {
    load();
  }, [load]);

  const submitTransfer = useCallback(async () => {
    setTxMsg(null);
    const amount = Number(txAmount);
    if (!/^0x[a-fA-F0-9]{40}$/.test(txTo.trim())) {
      setTxMsg({ kind: 'err', text: '请输入有效的收款地址（0x…40 位）' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setTxMsg({ kind: 'err', text: '请输入大于 0 的转账金额' });
      return;
    }
    setTxSubmitting(true);
    try {
      const r = await adminFetch<{ transfer: TreasuryTransfer }>('/treasury/transfers', {
        method: 'POST',
        body: JSON.stringify({ asset: txAsset, toAddress: txTo.trim(), amount, note: txNote.trim() || undefined }),
      });
      const status = r.transfer.status;
      setTxMsg({
        kind: 'ok',
        text:
          status === 'confirmed'
            ? '转账已完成并上链。'
            : '已发起多签申请，请让 3 位签署人中的 2 位在 Turnkey 面板确认后点击「广播」。',
      });
      setTxTo('');
      setTxAmount('');
      setTxNote('');
      loadTransfers();
    } catch (e) {
      setTxMsg({ kind: 'err', text: e instanceof Error ? e.message : '发起转账失败' });
    } finally {
      setTxSubmitting(false);
    }
  }, [txAsset, txTo, txAmount, txNote, loadTransfers]);

  const broadcastTransfer = useCallback(
    async (id: string) => {
      setBroadcastingId(id);
      setTxMsg(null);
      try {
        const r = await adminFetch<{ transfer: TreasuryTransfer }>(`/treasury/transfers/${id}/broadcast`, {
          method: 'POST',
        });
        setTxMsg({
          kind: r.transfer.status === 'confirmed' ? 'ok' : 'err',
          text:
            r.transfer.status === 'confirmed'
              ? '多签已批准，转账已广播上链。'
              : r.transfer.error ?? '多签尚未批准，请稍后再试。',
        });
        loadTransfers();
      } catch (e) {
        setTxMsg({ kind: 'err', text: e instanceof Error ? e.message : '广播失败' });
      } finally {
        setBroadcastingId(null);
      }
    },
    [loadTransfers],
  );

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
      <div className="rounded-xl border border-border p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Send size={15} /> 金库转账（多签申请）
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            金库钱包由 <b>2/3 多签</b>保护。发起后生成 Turnkey 签名请求，需 3 位签署人中的 2 位在 Turnkey
            面板确认，再点「广播」上链。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">资产</label>
            <select
              value={txAsset}
              onChange={(e) => setTxAsset(e.target.value === 'bnb' ? 'bnb' : 'usdt')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-transparent"
            >
              <option value="usdt">USDT</option>
              <option value="bnb">BNB (Gas)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">金额</label>
            <input
              type="number"
              min={0}
              step="any"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-transparent"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] text-muted-foreground">收款地址</label>
            <input
              value={txTo}
              onChange={(e) => setTxTo(e.target.value)}
              placeholder="0x…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-transparent font-mono"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] text-muted-foreground">备注（可选）</label>
            <input
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="用途说明"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={submitTransfer}
            disabled={txSubmitting}
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
          >
            {txSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 发起转账
          </button>
          {txMsg && (
            <span className={`text-xs ${txMsg.kind === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
              {txMsg.text}
            </span>
          )}
        </div>

        {/* Request history */}
        {transfers.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>状态</TableHead>
                  <TableHead>资产 / 金额</TableHead>
                  <TableHead>收款地址</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => {
                  const st = TRANSFER_STATUS[t.status] ?? { label: t.status, cls: '' };
                  const canBroadcast = t.status === 'awaiting_consensus' || t.status === 'broadcast';
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Badge className={st.cls}>{st.label}</Badge>
                        {t.error && <div className="text-[10px] text-red-500 mt-1">{t.error}</div>}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {fmtUsd(t.amount, 4)} {t.asset.toUpperCase()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.tx_hash ? (
                          <a
                            href={`https://bscscan.com/tx/${t.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-500 hover:underline"
                          >
                            {shortAddr(t.to_address)} ↗
                          </a>
                        ) : (
                          shortAddr(t.to_address)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canBroadcast && (
                          <button
                            onClick={() => broadcastTransfer(t.id)}
                            disabled={broadcastingId === t.id}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                          >
                            {broadcastingId === t.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : null}
                            广播
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
