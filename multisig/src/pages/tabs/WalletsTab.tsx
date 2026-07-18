import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, Loader2, ArrowUpRight } from 'lucide-react';
import { api, type InfraWallet } from '@/lib/api';
import { fmt } from '@/lib/supabase';
import { AddressDisplay } from '@/components/AddressDisplay';

const WALLET_META: Record<string, { label: string; accent: string }> = {
  treasury: { label: '金库钱包', accent: '#8A2B57' },
  settlement: { label: '清算钱包', accent: '#B23A6E' },
  flash_swap: { label: '闪兑钱包', accent: '#E0568F' },
  gas: { label: 'Gas 钱包', accent: '#f59e0b' },
};

export function WalletsTab({ onGoTransfer }: { onGoTransfer: () => void }) {
  const [wallets, setWallets] = useState<InfraWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await api.wallets();
      setWallets(w.wallets ?? []);
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

      <div className="space-y-2.5">
        {wallets.map((wlt, i) => {
          const meta = WALLET_META[wlt.wallet_type] ?? { label: wlt.wallet_type, accent: '#8A2B57' };
          return (
            <motion.div
              key={wlt.wallet_type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="brand-card rounded-2xl p-4"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.accent }}>
                    <Wallet size={14} />
                  </span>
                  <span className="text-[14px] font-bold text-[#160510] truncate">{meta.label}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-extrabold tracking-tight text-[#160510] leading-none">
                    {fmt(wlt.usdt)}
                    <span className="text-[10px] font-bold text-[#8A2B57]/60 ml-1">USDT</span>
                  </div>
                  <div className="text-[10px] text-[#8A2B57]/55 mt-1">{fmt(wlt.bnb, 4)} BNB</div>
                </div>
              </div>
              <AddressDisplay address={wlt.address} />
            </motion.div>
          );
        })}
        {!loading && wallets.length === 0 && !error && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/60 text-center">暂无钱包数据</div>
        )}
      </div>

      <button
        type="button"
        onClick={onGoTransfer}
        className="tap w-full flex items-center justify-center gap-2 brand-gradient text-white rounded-2xl px-4 py-3.5 font-bold text-[14px]"
      >
        <ArrowUpRight size={18} /> 从金库钱包转账（发起多签）
      </button>
    </>
  );
}
