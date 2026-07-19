import { Mail, ShieldCheck, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/auth';

const PERM_LABEL: Record<string, string> = {
  'dashboard.read': '仪表盘',
  'treasury.read': '金库查看',
  'treasury.write': '金库操作',
  'transactions.read': '交易查看',
  'security.read': '安全查看',
  'admins.read': '账户查看',
};

export function MeTab() {
  const { user, logout } = useAuth();

  return (
    <>
      <div className="brand-card rounded-2xl p-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl brand-gradient text-white mb-3">
          <ShieldCheck size={26} />
        </div>
        <div className="text-[16px] font-extrabold text-[#160510]">{user?.username ?? '—'}</div>
        <div className="text-[12px] text-[#8A2B57]/70 mt-0.5">超级合伙人 · 项目方</div>
      </div>

      <div className="brand-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <Mail size={16} className="text-[#8A2B57]/50 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-[#8A2B57]/55">邮箱</div>
            <div className="text-[13px] font-semibold text-[#160510] truncate">{user?.email ?? '—'}</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <KeyRound size={16} className="text-[#8A2B57]/50 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[10px] text-[#8A2B57]/55 mb-1">权限</div>
            <div className="flex flex-wrap gap-1.5">
              {(user?.permissions ?? []).map((p) => (
                <span key={p} className="text-[10px] font-semibold text-[#8A2B57] bg-[#8A2B57]/8 px-2 py-0.5 rounded-md">
                  {PERM_LABEL[p] ?? p}
                </span>
              ))}
              {(user?.permissions ?? []).length === 0 && <span className="text-[11px] text-[#8A2B57]/50">—</span>}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="tap w-full flex items-center justify-center gap-2 brand-card rounded-2xl px-4 py-3.5 text-[14px] font-bold text-red-500"
      >
        <LogOut size={17} /> 退出登录
      </button>
    </>
  );
}
