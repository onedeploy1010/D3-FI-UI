import { motion } from 'framer-motion';
import { UserPlus, ExternalLink, LogOut } from 'lucide-react';
import { shortAddr } from '@/lib/supabase';

const PARTNER_APP_URL = import.meta.env.VITE_PARTNER_APP_URL ?? 'https://d3-dapp.pages.dev';

/** Shown when a connected wallet is verified but is NOT a partner. */
export function BecomePartner({ address, onLogout }: { address: string; onLogout: () => void }) {
  return (
    <div className="app-frame flex flex-col items-center justify-center px-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#E0568F]/12 text-[#E0568F] mb-4">
          <UserPlus size={26} />
        </div>
        <h1 className="text-lg font-extrabold text-[#160510]">您还不是合伙人</h1>
        <p className="text-[13px] text-[#8A2B57]/70 mt-2 leading-relaxed">
          该钱包（{shortAddr(address)}）尚未成为合伙人。请先前往合伙人系统缴纳入盟金成为合伙人，之后即可进入多签系统。
        </p>

        <a
          href={PARTNER_APP_URL}
          target="_blank"
          rel="noreferrer"
          className="tap mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl brand-gradient text-white font-bold text-[15px]"
        >
          <ExternalLink size={18} /> 前往合伙人系统成为合伙人
        </a>

        <button
          type="button"
          onClick={onLogout}
          className="tap mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#8A2B57]/60"
        >
          <LogOut size={14} /> 断开钱包 / 换账号
        </button>
      </motion.div>
    </div>
  );
}
