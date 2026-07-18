import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ShieldAlert, CheckCircle2, ArrowUpRight, RefreshCw, Send } from 'lucide-react';
import {
  api,
  newRequestKey,
  turnkeyActivityUrl,
  type AllowlistRow,
  type TreasuryTransfer,
} from '@/lib/api';
import { shortAddr, fmt } from '@/lib/supabase';

const STATUS_LABEL: Record<string, string> = {
  awaiting_consensus: '等待多签',
  confirmed: '已确认',
  broadcasting: '广播中',
  failed: '失败',
  rejected: '已拒绝',
};

export function TransferTab() {
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
  const [transfers, setTransfers] = useState<TreasuryTransfer[]>([]);
  const [dest, setDest] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [al, tf] = await Promise.allSettled([api.allowlist(), api.transfers()]);
      if (al.status === 'fulfilled') setAllowlist(al.value.rows ?? []);
      if (tf.status === 'fulfilled') setTransfers(tf.value.transfers ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const amountNum = Number(amount);
  const valid = useMemo(
    () => Boolean(dest) && Number.isFinite(amountNum) && amountNum > 0,
    [dest, amountNum],
  );

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await api.proposeTransfer({
        asset: 'usdt',
        toAddress: dest,
        amount: amountNum,
        requestKey: newRequestKey(),
      });
      setOk(res.transfer?.status === 'awaiting_consensus' ? '已发起多签，等待 Turnkey 2/3 批准' : '已提交');
      setAmount('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起失败');
    } finally {
      setBusy(false);
    }
  };

  // Broadcast an on-chain-approved (Turnkey 2/3) transfer. Backend enforces
  // maker-checker: the broadcaster must differ from the proposer.
  const broadcast = async (id: string) => {
    if (broadcasting) return;
    setBroadcasting(id);
    setRowError((prev) => ({ ...prev, [id]: '' }));
    try {
      await api.broadcastTransfer(id);
      await load();
    } catch (e) {
      setRowError((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : '广播失败' }));
    } finally {
      setBroadcasting(null);
    }
  };

  return (
    <>
      <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">从金库钱包转账</h2>

      <div className="brand-card rounded-2xl p-4 space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-[#8A2B57]/70">收款地址（白名单）</label>
          <select
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[14px] text-[#160510] focus:border-[#E0568F]/50"
          >
            <option value="">选择收款地址…</option>
            {allowlist.map((r) => (
              <option key={r.id} value={r.address}>
                {r.label ? `${r.label} · ` : ''}
                {shortAddr(r.address)}
              </option>
            ))}
          </select>
          {!loading && allowlist.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-1">白名单为空——需先在后台添加允许的收款地址。</p>
          )}
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#8A2B57]/70">金额 (USDT)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-lg font-bold text-[#160510] focus:border-[#E0568F]/50"
          />
        </div>

        {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
        {ok && (
          <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 size={14} /> {ok}
          </div>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="w-full py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 tap"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
          发起多签转账
        </motion.button>
        <p className="text-[10px] text-[#8A2B57]/45 text-center">
          发起后需在 Turnkey 完成 2/3 批准，再由另一位管理员广播。
        </p>
      </div>

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">最近转账</h2>
        <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div className="space-y-2">
        {transfers.length === 0 && !loading && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">暂无转账记录</div>
        )}
        {transfers.map((t) => (
          <div key={t.id} className="brand-card rounded-2xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-extrabold text-[#160510]">
                {fmt(t.amount_usdt)} <span className="text-[10px] text-[#8A2B57]/60">USDT</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  t.status === 'confirmed'
                    ? 'text-emerald-700 bg-emerald-500/12'
                    : t.status === 'awaiting_consensus'
                      ? 'text-amber-700 bg-amber-500/12'
                      : 'text-[#8A2B57] bg-[#8A2B57]/8'
                }`}
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
            <div className="text-[10px] text-[#8A2B57]/55 mt-1 font-mono truncate">→ {shortAddr(t.to_address)}</div>
            {t.status === 'awaiting_consensus' && (
              <>
                <div className="flex items-center gap-2 mt-2">
                  <a
                    href={turnkeyActivityUrl(t.turnkey_activity_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="tap inline-flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-2.5 py-1.5 rounded-lg"
                  >
                    <ShieldAlert size={12} /> 去 Turnkey 批准
                  </a>
                  <button
                    type="button"
                    onClick={() => void broadcast(t.id)}
                    disabled={broadcasting === t.id}
                    className="tap inline-flex items-center gap-1 text-[11px] font-bold text-[#8A2B57] bg-[#8A2B57]/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {broadcasting === t.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    广播
                  </button>
                </div>
                {rowError[t.id] && (
                  <div className="text-[10px] text-red-500 font-medium mt-1.5">{rowError[t.id]}</div>
                )}
                <p className="text-[9px] text-[#8A2B57]/45 mt-1">需 Turnkey 完成 2/3 批准，且广播人须与发起人不同</p>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
