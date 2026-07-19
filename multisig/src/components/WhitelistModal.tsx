import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, type AllowlistRow } from '@/lib/api';
import { AddressDisplay } from '@/components/AddressDisplay';

/** Popup to add / remove treasury 收款白名单. */
export function WhitelistModal({
  allowlist,
  onClose,
  onChange,
}: {
  allowlist: AllowlistRow[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const a = addr.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setError('地址格式无效（0x + 40 位十六进制）');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addAllowlist({ address: a, label: label.trim() || undefined });
      setAddr('');
      setLabel('');
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (address: string) => {
    try {
      await api.removeAllowlist(address);
      onChange();
    } catch {
      /* ignore */
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="关闭" onClick={onClose} className="absolute inset-0 bg-[#160510]/30 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm brand-card rounded-t-3xl sm:rounded-3xl sm:mb-4 p-5 safe-pb max-h-[88dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-extrabold text-[#160510]">收款白名单</h2>
          <button type="button" onClick={onClose} className="tap p-1.5 rounded-full bg-[#8A2B57]/8 text-[#8A2B57]"><X size={16} /></button>
        </div>

        <div className="space-y-2.5 mb-4">
          <input value={addr} onChange={(e) => setAddr(e.target.value)} autoCapitalize="none" spellCheck={false} placeholder="0x 收款地址（42 位）" className="w-full px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[13px] font-mono text-[#160510] focus:border-[#E0568F]/50" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="备注（可选，如 OKX 提现）" className="w-full px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[14px] text-[#160510] focus:border-[#E0568F]/50" />
          {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
          <button type="button" disabled={busy || !addr.trim()} onClick={() => void add()} className="tap w-full py-3 rounded-xl brand-gradient text-white font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 添加到白名单
          </button>
        </div>

        <div className="space-y-2">
          {allowlist.map((r) => (
            <div key={r.id} className="rounded-2xl bg-[#8A2B57]/[0.04] border border-[#8A2B57]/10 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-[13px] font-bold text-[#160510] truncate">{r.label || '未命名地址'}</div>
                <button type="button" onClick={() => void remove(r.address)} className="tap shrink-0 p-2 rounded-lg text-red-500/70 bg-red-500/8"><Trash2 size={14} /></button>
              </div>
              <AddressDisplay address={r.address} />
            </div>
          ))}
          {allowlist.length === 0 && <div className="text-[13px] text-[#8A2B57]/55 text-center py-3">白名单为空</div>}
        </div>
      </motion.div>
    </motion.div>
  );
}
