import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCw, HandCoins, Plus, X, CheckCircle2 } from 'lucide-react';
import { partnerApi, type SubsidyQuota, type SubsidyTicket, type SubsidyKind } from '@/lib/siwe';
import { fmt } from '@/lib/supabase';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '审核中', cls: 'text-amber-700 bg-amber-500/12' },
  approved: { label: '已通过', cls: 'text-emerald-700 bg-emerald-500/12' },
  rejected: { label: '已拒绝', cls: 'text-red-600 bg-red-500/12' },
  paid: { label: '已支付', cls: 'text-emerald-700 bg-emerald-500/12' },
};
const KIND_LABEL: Record<string, string> = { partner_subsidy: '合伙人补贴', market_subsidy: '市场补贴', market_leader: '市场领导' };

export function PartnerSubsidy() {
  const [partnerQuota, setPartnerQuota] = useState<SubsidyQuota | null>(null);
  const [marketQuota, setMarketQuota] = useState<SubsidyQuota | null>(null);
  const [tickets, setTickets] = useState<SubsidyTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pq, mq, tk] = await Promise.allSettled([
        partnerApi.subsidyQuota('partner_subsidy'),
        partnerApi.subsidyQuota('market_subsidy'),
        partnerApi.subsidyTickets(),
      ]);
      if (pq.status === 'fulfilled') setPartnerQuota(pq.value.quota);
      if (mq.status === 'fulfilled') setMarketQuota(mq.value.quota);
      if (tk.status === 'fulfilled') setTickets(tk.value.tickets ?? []);
      if (pq.status === 'rejected' && tk.status === 'rejected') throw pq.reason;
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const quotaCard = (label: string, q: SubsidyQuota | null, accent: string) => (
    <div className="brand-card rounded-2xl p-3.5">
      <div className="text-[11px] font-semibold text-[#8A2B57]/60 mb-1">{label}{q ? ` · ${q.ratePct}%` : ''}</div>
      <div className="text-lg font-extrabold tracking-tight leading-none" style={{ color: accent }}>${fmt(q?.remaining)}</div>
      <div className="text-[10px] text-[#8A2B57]/50 mt-1">可用 / 额度 ${fmt(q?.cap)}</div>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">补贴额度</h2>
        <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      <div className="grid grid-cols-2 gap-2.5">
        {quotaCard('合伙人补贴', partnerQuota, '#8A2B57')}
        {quotaCard('市场补贴', marketQuota, '#E0568F')}
      </div>

      <button type="button" onClick={() => setShowApply(true)} className="tap w-full flex items-center justify-center gap-2 brand-gradient text-white rounded-2xl px-4 py-3.5 font-bold text-[14px]">
        <Plus size={18} /> 申请补贴
      </button>

      <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">申请记录</h2>
      <div className="space-y-2">
        {tickets.length === 0 && !loading && <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">暂无申请</div>}
        {tickets.map((t) => {
          const st = STATUS[t.status] ?? { label: t.status, cls: 'text-[#8A2B57] bg-[#8A2B57]/8' };
          return (
            <div key={t.id} className="brand-card rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-extrabold text-[#160510]">${fmt(t.amount_usd)}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              </div>
              <div className="text-[11px] text-[#8A2B57]/60 mt-0.5">{KIND_LABEL[t.kind] ?? t.kind}{t.purpose ? ` · ${t.purpose}` : ''}</div>
              {(t.applied_at || t.created_at) && <div className="text-[10px] text-[#8A2B57]/45 mt-1">{new Date(t.applied_at ?? t.created_at!).toLocaleString()}</div>}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {showApply && <ApplyModal onClose={() => setShowApply(false)} onDone={() => void load()} />}
      </AnimatePresence>
    </>
  );
}

function ApplyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<SubsidyKind>('partner_subsidy');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const amountNum = Number(amount);
  const valid = Number.isFinite(amountNum) && amountNum > 0 && purpose.trim().length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // reserve = 预支（无需票据）；报销需票据，此处先支持预支。
      await partnerApi.createSubsidy({ kind, amountUsd: amountNum, purpose: purpose.trim(), applicationType: 'reserve' });
      setOk(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="关闭" onClick={onClose} className="absolute inset-0 bg-[#160510]/30 backdrop-blur-sm" />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-sm brand-card rounded-t-3xl sm:rounded-3xl sm:mb-4 p-5 safe-pb max-h-[88dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-extrabold text-[#160510]">申请补贴</h2>
          <button type="button" onClick={onClose} className="tap p-1.5 rounded-full bg-[#8A2B57]/8 text-[#8A2B57]"><X size={16} /></button>
        </div>

        {ok ? (
          <div className="text-center space-y-3 py-3">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <div className="text-[15px] font-bold text-[#160510]">申请已提交，等待审核</div>
            <button type="button" onClick={onClose} className="tap w-full py-3 rounded-xl brand-gradient text-white font-bold text-[14px]">完成</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['partner_subsidy', 'market_subsidy'] as SubsidyKind[]).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`tap flex-1 py-2.5 rounded-xl text-[13px] font-bold ${kind === k ? 'brand-gradient text-white' : 'bg-[#8A2B57]/8 text-[#8A2B57]'}`}>
                  {k === 'partner_subsidy' ? '合伙人补贴' : '市场补贴'}
                </button>
              ))}
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#8A2B57]/70">金额 (USD)</label>
              <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-lg font-bold text-[#160510] focus:border-[#E0568F]/50" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#8A2B57]/70">用途说明</label>
              <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} placeholder="如：地推物料 / 会议场地…" className="w-full mt-1 px-3.5 py-3 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[14px] text-[#160510] focus:border-[#E0568F]/50 resize-none" />
            </div>
            {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
            <button type="button" disabled={!valid || busy} onClick={() => void submit()} className="tap w-full py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <HandCoins size={18} />} 提交申请
            </button>
            <p className="text-[10px] text-[#8A2B57]/45 text-center">当前为预支申请（无需票据）；报销（需票据）后续开放。</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
