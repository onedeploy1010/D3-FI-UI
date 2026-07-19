import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, RefreshCw, Loader2, ArrowUpRight, ListChecks, Send, ShieldAlert } from 'lucide-react';
import { api, turnkeyActivityUrl, type InfraWallet, type AllowlistRow, type TreasuryTransfer } from '@/lib/api';
import { fmt } from '@/lib/supabase';
import { AddressDisplay } from '@/components/AddressDisplay';
import { TransferModal } from '@/components/TransferModal';
import { WhitelistModal } from '@/components/WhitelistModal';

const WALLET_META: Record<string, { label: string; accent: string }> = {
  treasury: { label: '金库钱包', accent: '#8A2B57' },
  settlement: { label: '清算钱包', accent: '#B23A6E' },
  flash_swap: { label: '闪兑钱包', accent: '#E0568F' },
  gas: { label: 'Gas 钱包', accent: '#f59e0b' },
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_consensus: '等待多签',
  confirmed: '已确认',
  failed: '失败',
  rejected: '已拒绝',
};

export function WalletsTab() {
  const [wallets, setWallets] = useState<InfraWallet[]>([]);
  const [allowlist, setAllowlist] = useState<AllowlistRow[]>([]);
  const [transfers, setTransfers] = useState<TreasuryTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'transfer' | 'whitelist' | null>(null);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, al, tf] = await Promise.allSettled([api.wallets(), api.allowlist(), api.transfers()]);
      if (w.status === 'fulfilled') setWallets(w.value.wallets ?? []);
      else throw w.reason;
      if (al.status === 'fulfilled') setAllowlist(al.value.rows ?? []);
      if (tf.status === 'fulfilled') setTransfers(tf.value.transfers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const broadcast = async (id: string) => {
    if (broadcasting) return;
    setBroadcasting(id);
    try {
      await api.broadcastTransfer(id);
      await load();
    } catch {
      /* surfaced on retry */
    } finally {
      setBroadcasting(null);
    }
  };

  const pending = transfers.filter((t) => t.status === 'awaiting_consensus');

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">钱包状态</h2>
        <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      <div className="space-y-2.5">
        {wallets.map((wlt, i) => {
          const meta = WALLET_META[wlt.wallet_type] ?? { label: wlt.wallet_type, accent: '#8A2B57' };
          return (
            <motion.div key={wlt.wallet_type} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="brand-card rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.accent }}><Wallet size={14} /></span>
                  <span className="text-[14px] font-bold text-[#160510] truncate">{meta.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-extrabold tracking-tight text-[#160510] leading-none">{fmt(wlt.usdt)}<span className="text-[10px] font-bold text-[#8A2B57]/60 ml-1">USDT</span></div>
                  <div className="text-[10px] text-[#8A2B57]/55 mt-1">{fmt(wlt.bnb, 4)} BNB</div>
                </div>
              </div>
              <AddressDisplay address={wlt.address} />
            </motion.div>
          );
        })}
        {!loading && wallets.length === 0 && !error && <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/60 text-center">暂无钱包数据</div>}
      </div>

      {/* 操作按钮 */}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setModal('transfer')} className="tap flex items-center justify-center gap-2 brand-gradient text-white rounded-2xl px-4 py-3.5 font-bold text-[14px]">
          <ArrowUpRight size={18} /> 转账
        </button>
        <button type="button" onClick={() => setModal('whitelist')} className="tap flex items-center justify-center gap-2 brand-card text-[#8A2B57] rounded-2xl px-4 py-3.5 font-bold text-[14px]">
          <ListChecks size={18} /> 白名单
        </button>
      </div>

      {/* 待广播 / 进行中的转账 */}
      {pending.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">进行中的转账</h2>
          <div className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="brand-card rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-extrabold text-[#160510]">{fmt(t.amount_usdt)} <span className="text-[10px] text-[#8A2B57]/60">USDT</span></span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-700 bg-amber-500/12">{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                <div className="mt-1.5"><AddressDisplay address={t.to_address} label="收款地址" /></div>
                <div className="flex items-center gap-2 mt-2">
                  <a href={turnkeyActivityUrl(t.turnkey_activity_id)} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-2.5 py-1.5 rounded-lg"><ShieldAlert size={12} /> 去 Turnkey 批准</a>
                  <button type="button" onClick={() => void broadcast(t.id)} disabled={broadcasting === t.id} className="tap inline-flex items-center gap-1 text-[11px] font-bold text-[#8A2B57] bg-[#8A2B57]/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50">{broadcasting === t.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} 广播</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {modal === 'transfer' && (
          <TransferModal allowlist={allowlist} onClose={() => setModal(null)} onDone={() => void load()} onManageWhitelist={() => setModal('whitelist')} />
        )}
        {modal === 'whitelist' && (
          <WhitelistModal allowlist={allowlist} onClose={() => setModal(null)} onChange={() => void load()} />
        )}
      </AnimatePresence>
    </>
  );
}
