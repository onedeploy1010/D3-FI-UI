import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw, UserRound, ShieldCheck } from 'lucide-react';
import { api, type AdminRow } from '@/lib/api';

const PERM_LABEL: Record<string, string> = {
  'dashboard.read': '仪表盘',
  'treasury.read': '金库查看',
  'treasury.write': '金库操作',
  'transactions.read': '交易查看',
  'security.read': '安全查看',
  'admins.read': '账户查看',
};

export function AccountsTab() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admins();
      setRows((res.rows ?? []).filter((r) => r.role === 'super_partner'));
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
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">超级合伙人账户</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#E0568F]">{rows.length}</span>
          <button type="button" onClick={() => void load()} className="tap p-1.5 rounded-lg text-[#8A2B57]/60 bg-[#8A2B57]/6">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {error && <div className="brand-card rounded-2xl p-4 text-[13px] text-red-500 font-medium">{error}</div>}

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <motion.div
            key={r.userId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="brand-card rounded-2xl p-4"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-xl bg-[#E0568F]/10 flex items-center justify-center text-[#E0568F] shrink-0">
                <UserRound size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-[#160510] truncate">{r.username}</div>
                <div className="text-[10px] text-[#8A2B57]/60 flex items-center gap-1">
                  <ShieldCheck size={11} className="text-emerald-500" /> 超级合伙人
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.permissions.map((p) => (
                <span key={p} className="text-[10px] font-semibold text-[#8A2B57] bg-[#8A2B57]/8 px-2 py-0.5 rounded-md">
                  {PERM_LABEL[p] ?? p}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
        {rows.length === 0 && !loading && !error && (
          <div className="brand-card rounded-2xl p-4 text-[13px] text-[#8A2B57]/55 text-center">暂无账户</div>
        )}
      </div>

      <p className="text-center text-[10px] text-[#8A2B57]/40 pt-1">账户与角色在 admin-panel 的权限管理中设置</p>
    </>
  );
}
