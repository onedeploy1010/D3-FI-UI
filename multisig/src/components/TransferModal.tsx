import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Loader2, ArrowUpRight, ChevronLeft, ChevronRight, Check, CheckCircle2, ListChecks,
} from 'lucide-react';
import { api, newRequestKey, type AllowlistRow } from '@/lib/api';
import { shortAddr, fmt } from '@/lib/supabase';
import { AddressDisplay } from '@/components/AddressDisplay';

/** Stepped popup: 选地址 → 金额 → 确认 → 发起多签. */
export function TransferModal({
  allowlist,
  onClose,
  onDone,
  onManageWhitelist,
}: {
  allowlist: AllowlistRow[];
  onClose: () => void;
  onDone: () => void;
  onManageWhitelist: () => void;
}) {
  const [step, setStep] = useState(1);
  const [dest, setDest] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const destLabel = useMemo(() => allowlist.find((r) => r.address === dest)?.label, [allowlist, dest]);

  const submit = async () => {
    if (!dest || !amountValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.proposeTransfer({ asset: 'usdt', toAddress: dest, amount: amountNum, requestKey: newRequestKey() });
      setDone(res.transfer?.status === 'awaiting_consensus' ? '已发起多签，等待 Turnkey 2/3 批准' : '已提交');
      setStep(4);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起失败');
    } finally {
      setBusy(false);
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
          <h2 className="text-[16px] font-extrabold text-[#160510]">发起转账</h2>
          <button type="button" onClick={onClose} className="tap p-1.5 rounded-full bg-[#8A2B57]/8 text-[#8A2B57]"><X size={16} /></button>
        </div>

        {step < 4 && (
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {[1, 2, 3].map((s) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${s === step ? 'w-6 bg-[#E0568F]' : s < step ? 'w-1.5 bg-[#E0568F]/50' : 'w-1.5 bg-[#8A2B57]/15'}`} />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <div className="text-[12px] font-semibold text-[#8A2B57]/70">① 选择收款地址（白名单）</div>
            {allowlist.length === 0 ? (
              <button type="button" onClick={onManageWhitelist} className="tap w-full rounded-2xl bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 p-4 text-[13px] text-[#E0568F] font-semibold flex items-center justify-center gap-1.5"><ListChecks size={15} /> 白名单为空 · 添加收款地址</button>
            ) : (
              allowlist.map((r) => (
                <button key={r.id} type="button" onClick={() => setDest(r.address)} className={`tap w-full rounded-2xl bg-[#8A2B57]/[0.05] border p-3.5 flex items-center justify-between gap-2 ${dest === r.address ? 'border-[#E0568F]/60 ring-1 ring-[#E0568F]/40' : 'border-[#8A2B57]/10'}`}>
                  <div className="min-w-0 text-left">
                    <div className="text-[13px] font-bold text-[#160510] truncate">{r.label || '未命名地址'}</div>
                    <div className="text-[10px] font-mono text-[#8A2B57]/55 truncate">{shortAddr(r.address)}</div>
                  </div>
                  {dest === r.address ? <Check size={18} className="text-[#E0568F] shrink-0" /> : <ChevronRight size={16} className="text-[#8A2B57]/30 shrink-0" />}
                </button>
              ))
            )}
            <button type="button" disabled={!dest} onClick={() => setStep(2)} className="tap w-full mt-1 py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-1.5 disabled:opacity-40">下一步 <ChevronRight size={17} /></button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-[12px] font-semibold text-[#8A2B57]/70">② 输入金额 (USDT)</div>
            <div className="rounded-2xl bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 p-4">
              <input type="number" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full text-3xl font-extrabold text-center text-[#160510] bg-transparent outline-none tracking-tight" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="tap px-5 py-3.5 rounded-xl bg-[#8A2B57]/8 text-[#8A2B57] font-bold text-[15px] flex items-center gap-1"><ChevronLeft size={17} /> 上一步</button>
              <button type="button" disabled={!amountValid} onClick={() => setStep(3)} className="tap flex-1 py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-1.5 disabled:opacity-40">下一步 <ChevronRight size={17} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="text-[12px] font-semibold text-[#8A2B57]/70">③ 确认并发起多签</div>
            <div className="rounded-2xl bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 p-4 space-y-3">
              <div className="text-center">
                <div className="text-[10px] text-[#8A2B57]/55">转账金额</div>
                <div className="text-3xl font-extrabold text-[#E0568F] tracking-tight">{fmt(amountNum)} <span className="text-sm">USDT</span></div>
              </div>
              <div>
                <div className="text-[10px] text-[#8A2B57]/55 mb-1">收款方 {destLabel ? `· ${destLabel}` : ''}</div>
                <AddressDisplay address={dest} />
              </div>
            </div>
            {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)} className="tap px-5 py-3.5 rounded-xl bg-[#8A2B57]/8 text-[#8A2B57] font-bold text-[15px] flex items-center gap-1"><ChevronLeft size={17} /> 上一步</button>
              <button type="button" disabled={busy} onClick={() => void submit()} className="tap flex-1 py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />} 发起多签</button>
            </div>
            <p className="text-[10px] text-[#8A2B57]/45 text-center">发起后需在 Turnkey 完成 2/3 批准，再由另一位管理员广播。</p>
          </div>
        )}

        {step === 4 && (
          <div className="text-center space-y-3 py-2">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <div className="text-[15px] font-bold text-[#160510]">{done}</div>
            <button type="button" onClick={onClose} className="tap w-full py-3 rounded-xl brand-gradient text-white font-bold text-[14px]">完成</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
