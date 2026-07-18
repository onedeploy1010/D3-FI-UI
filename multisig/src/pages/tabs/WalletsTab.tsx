import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ExternalLink, ShieldAlert, RefreshCw, Loader2, ArrowUpRight } from 'lucide-react';
import { api, turnkeyActivityUrl, type InfraWallet, type PendingApproval } from '@/lib/api';
import { shortAddr, fmt } from '@/lib/supabase';

const WALLET_META: Record<string, { label: string; accent: string }> = {
  treasury: { label: '金库钱包', accent: '#8A2B57' },
  settlement: { label: '清算钱包', accent: '#B23A6E' },
  flash_swap: { label: '闪兑钱包', accent: '#E0568F' },
  gas: { label: 'Gas 钱包', accent: '#f59e0b' },
};

export function WalletsTab({ onGoTransfer }: { onGoTransfer: () => void }) {
  const [wallets, setWallets] = useState<InfraWallet[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, a] = await Promise.allSettled([api.wallets(), api.approvals()]);
      if (w.status === 'fulfilled') setWallets(w.value.wallets ?? []);
      else throw w.reason;
      if (a.status === 'fulfilled') setApprovals(a.value.approvals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">钱包状态</h2>
        <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      <div className="grid grid-cols-2 gap-2.5">
        {wallets.map((wlt, i) => {
          const meta = WALLET_META[wlt.wallet_type] ?? { label: wlt.wallet_type, accent: '#8A2B57' };
          return (
            <motion.div
              key={wlt.wallet_type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="brand-card rounded-2xl p-3.5"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.accent }}>
                  <Wallet size={13} />
                </span>
                <span className="text-[12px] font-bold text-[#160510] truncate">{meta.label}</span>
              </div>
              <div className="text-lg font-extrabold tracking-tight text-[#160510] leading-none">
                {fmt(wlt.usdt)}
                <span className="text-[10px] font-bold text-[#8A2B57]/60 ml-1">USDT</span>
              </div>
              <div className="text-[10px] text-[#8A2B57]/55 mt-1">{fmt(wlt.bnb, 4)} BNB</div>
              <div className="text-[9px] text-[#8A2B57]/40 mt-1 font-mono truncate">{shortAddr(wlt.address)}</div>
            </motion.div>
          );
        })}
        {!loading && wallets.length === 0 && !error && (
          <div className="col-span-2 brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/60 text-center">暂无钱包数据</div>
        )}
      </div>

      <button
        type="button"
        onClick={onGoTransfer}
        className="tap w-full flex items-center justify-center gap-2 brand-gradient text-white rounded-2xl px-4 py-3.5 font-bold text-[14px]"
      >
        <ArrowUpRight size={18} /> 从金库钱包转账（发起多签）
      </button>

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">待批准</h2>
        <span className="text-[11px] font-bold text-[#E0568F]">{approvals.length}</span>
      </div>
      <div className="space-y-2">
        {approvals.length === 0 && !loading && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">暂无待批准事项</div>
        )}
        {approvals.map((ap) => (
          <div key={ap.id} className="brand-card rounded-2xl p-3.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[#160510] truncate">{ap.action}</div>
              <div className="text-[10px] text-[#8A2B57]/55 mt-0.5">
                {ap.status} · {new Date(ap.created_at).toLocaleString()}
              </div>
            </div>
            <a
              href={turnkeyActivityUrl()}
              target="_blank"
              rel="noreferrer"
              className="tap shrink-0 flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-2.5 py-1.5 rounded-lg"
            >
              <ShieldAlert size={12} /> 去 Turnkey
            </a>
          </div>
        ))}
      </div>

      <a
        href={turnkeyActivityUrl()}
        target="_blank"
        rel="noreferrer"
        className="tap flex items-center justify-center gap-2 brand-card rounded-2xl px-4 py-3 text-[13px] font-bold text-[#8A2B57] mt-1"
      >
        <ExternalLink size={15} /> 打开 Turnkey 多签后台
      </a>
    </>
  );
}
