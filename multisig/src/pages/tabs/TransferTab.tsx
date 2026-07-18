import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ShieldAlert, CheckCircle2, ArrowUpRight, RefreshCw, Send, Plus, Trash2 } from 'lucide-react';
import {
  api,
  newRequestKey,
  turnkeyActivityUrl,
  type AllowlistRow,
  type TreasuryTransfer,
} from '@/lib/api';
import { shortAddr, fmt } from '@/lib/supabase';
import { AddressDisplay } from '@/components/AddressDisplay';

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
  // Whitelist management
  const [showAl, setShowAl] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [alBusy, setAlBusy] = useState(false);
  const [alError, setAlError] = useState<string | null>(null);

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

  const addWhitelist = async () => {
    const addr = newAddr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setAlError('地址格式无效（0x + 40 位十六进制）');
      return;
    }
    setAlBusy(true);
    setAlError(null);
    try {
      await api.addAllowlist({ address: addr, label: newLabel.trim() || undefined });
      setNewAddr('');
      setNewLabel('');
      await load();
    } catch (e) {
      setAlError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAlBusy(false);
    }
  };

  const removeWhitelist = async (address: string) => {
    setAlError(null);
    try {
      await api.removeAllowlist(address);
      await load();
    } catch (e) {
      setAlError(e instanceof Error ? e.message : '删除失败');
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

      {/* 收款白名单管理 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">收款白名单</h2>
        <button
          type="button"
          onClick={() => { setShowAl((v) => !v); setAlError(null); }}
          className="tap flex items-center gap-1 text-[11px] font-bold text-[#E0568F]"
        >
          <Plus size={13} /> {showAl ? '收起' : '添加'}
        </button>
      </div>
      {showAl && (
        <div className="brand-card rounded-2xl p-4 space-y-2.5">
          <input
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[13px] font-mono text-[#160510] focus:border-[#E0568F]/50"
            placeholder="0x 收款地址（42 位）"
          />
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[14px] text-[#160510] focus:border-[#E0568F]/50"
            placeholder="备注（可选，如 OKX 提现）"
          />
          {alError && <div className="text-[12px] text-red-500 font-medium">{alError}</div>}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            disabled={alBusy || !newAddr.trim()}
            onClick={() => void addWhitelist()}
            className="w-full py-3 rounded-xl brand-gradient text-white font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 tap"
          >
            {alBusy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            添加到白名单
          </motion.button>
          <p className="text-[10px] text-[#8A2B57]/45 text-center">仅白名单地址可作为转账收款方（新增会记入审计）。</p>
        </div>
      )}
      <div className="space-y-2">
        {allowlist.length === 0 && !loading && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">白名单为空，先添加收款地址</div>
        )}
        {allowlist.map((r) => (
          <div key={r.id} className="brand-card rounded-2xl p-3.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-[13px] font-bold text-[#160510] truncate">{r.label || '未命名地址'}</div>
              <button
                type="button"
                onClick={() => void removeWhitelist(r.address)}
                className="tap shrink-0 p-2 rounded-lg text-red-500/70 bg-red-500/8"
                aria-label="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <AddressDisplay address={r.address} />
          </div>
        ))}
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
            <div className="mt-1.5">
              <AddressDisplay address={t.to_address} label="收款地址" />
            </div>
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
