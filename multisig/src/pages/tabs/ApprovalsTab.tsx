import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, ShieldAlert, CheckCircle2, ExternalLink } from 'lucide-react';
import { api, turnkeyActivityUrl, type PendingApproval } from '@/lib/api';

export function ApprovalsTab() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.approvals();
      setApprovals(res.approvals ?? []);
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
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">待批准事项</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#E0568F]">{approvals.length}</span>
          <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      {approvals.length === 0 && !loading && !error && (
        <div className="brand-card rounded-2xl p-8 text-center">
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
          <div className="text-[13px] text-[#8A2B57]/60">暂无待批准事项</div>
        </div>
      )}

      <div className="space-y-2">
        {approvals.map((ap, i) => (
          <motion.div
            key={ap.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="brand-card rounded-2xl p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[14px] font-bold text-[#160510] truncate">{ap.action}</span>
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-amber-700 bg-amber-500/12">
                {ap.status}
              </span>
            </div>
            {ap.target_type && <div className="text-[11px] text-[#8A2B57]/55">{ap.target_type}</div>}
            <div className="text-[10px] text-[#8A2B57]/45 mt-1">{new Date(ap.created_at).toLocaleString()}</div>
            <a
              href={turnkeyActivityUrl()}
              target="_blank"
              rel="noreferrer"
              className="tap mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-3 py-1.5 rounded-lg"
            >
              <ShieldAlert size={12} /> 去 Turnkey 批准
            </a>
          </motion.div>
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
