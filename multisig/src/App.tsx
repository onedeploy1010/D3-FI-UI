import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { Login } from '@/pages/Login';
import { SuperPartnerHome } from '@/pages/SuperPartnerHome';

function Gate() {
  const { user, loading, isSuperPartner, logout } = useAuth();

  if (loading) {
    return (
      <div className="app-frame flex items-center justify-center">
        <Loader2 className="animate-spin text-[#E0568F]" size={28} />
      </div>
    );
  }

  if (!user) return <Login />;

  if (isSuperPartner) return <SuperPartnerHome />;

  // Logged in but not a recognised multisig role (partner area lands later).
  return (
    <div className="app-frame flex flex-col items-center justify-center px-8 text-center gap-3">
      <p className="text-[15px] font-bold text-[#160510]">该账号暂无多签权限</p>
      <p className="text-[12px] text-[#8A2B57]/60">
        合伙人端（伞下入金 · 闪兑 · 多签申请）后期开放。请联系项目方设置超级合伙人角色。
      </p>
      <button
        type="button"
        onClick={() => void logout()}
        className="tap mt-2 px-5 py-2.5 rounded-xl brand-gradient text-white text-[13px] font-bold"
      >
        退出登录
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
