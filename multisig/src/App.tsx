import { Loader2, AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { usePartnerAuth } from '@/hooks/usePartnerAuth';
import { Login } from '@/pages/Login';
import { SuperPartnerHome } from '@/pages/SuperPartnerHome';
import { PartnerHome } from '@/pages/PartnerHome';
import { BecomePartner } from '@/pages/BecomePartner';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="app-frame flex flex-col items-center justify-center px-8 text-center gap-3">{children}</div>;
}

function Gate() {
  const { user, loading, isSuperPartner, logout } = useAuth();
  const partner = usePartnerAuth();

  if (loading) {
    return (
      <div className="app-frame flex items-center justify-center">
        <Loader2 className="animate-spin text-[#E0568F]" size={28} />
      </div>
    );
  }

  // 1) Super-partner (project party) — email OTP session.
  if (isSuperPartner) return <SuperPartnerHome />;

  // 2) Partner — wallet connected + SIWE + is_partner check.
  if (partner.isConnected) {
    if (partner.state === 'verifying') {
      return (
        <Centered>
          <Loader2 className="animate-spin text-[#E0568F]" size={28} />
          <p className="text-[13px] text-[#8A2B57]/70">验证合伙人身份中…</p>
        </Centered>
      );
    }
    if (partner.state === 'partner' && partner.address) {
      return <PartnerHome address={partner.address} onLogout={partner.logout} />;
    }
    if (partner.state === 'not_partner' && partner.address) {
      return <BecomePartner address={partner.address} onLogout={partner.logout} />;
    }
    if (partner.state === 'error') {
      return (
        <Centered>
          <AlertTriangle className="text-amber-500" size={28} />
          <p className="text-[14px] font-bold text-[#160510]">验证失败</p>
          <p className="text-[12px] text-[#8A2B57]/60">{partner.error ?? '请重试'}</p>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => void partner.verify()} className="tap px-5 py-2.5 rounded-xl brand-gradient text-white text-[13px] font-bold">
              重试
            </button>
            <button type="button" onClick={partner.logout} className="tap px-5 py-2.5 rounded-xl bg-[#8A2B57]/10 text-[#8A2B57] text-[13px] font-bold">
              断开
            </button>
          </div>
        </Centered>
      );
    }
  }

  // 3) Logged in via Supabase but not a recognised multisig role.
  if (user) {
    return (
      <Centered>
        <p className="text-[15px] font-bold text-[#160510]">该账号暂无多签权限</p>
        <p className="text-[12px] text-[#8A2B57]/60">请联系项目方设置超级合伙人角色，或用合伙人钱包登录。</p>
        <button type="button" onClick={() => void logout()} className="tap mt-2 px-5 py-2.5 rounded-xl brand-gradient text-white text-[13px] font-bold">
          退出登录
        </button>
      </Centered>
    );
  }

  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
