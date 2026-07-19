import type { ReactNode } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth';

/** Mobile-app frame: D3-branded top bar + scrollable content. */
export function MobileShell({
  title,
  children,
  bottom,
  subtitle,
  onLogout,
}: {
  title: string;
  children: ReactNode;
  bottom?: ReactNode;
  /** Overrides the Supabase-derived identity line (used by the wallet/partner side). */
  subtitle?: string;
  /** Overrides the Supabase logout (used by the wallet/partner side). */
  onLogout?: () => void;
}) {
  const { user, logout } = useAuth();
  const identity = subtitle ?? (user ? `${user.username} · ${user.role === 'super_partner' ? '超级合伙人' : user.role}` : '');
  const doLogout = onLogout ?? (() => void logout());
  return (
    <div className="app-frame flex flex-col">
      <header className="safe-pt sticky top-0 z-20 px-4 pb-3 flex items-center justify-between gap-2 backdrop-blur-md bg-white/55 border-b border-[#8A2B57]/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl brand-gradient flex items-center justify-center text-white shrink-0">
            <ShieldCheck size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold tracking-tight text-[#160510] truncate">{title}</div>
            {identity && <div className="text-[10px] text-[#8A2B57]/70 truncate">{identity}</div>}
          </div>
        </div>
        <button
          type="button"
          onClick={doLogout}
          className="tap shrink-0 p-2 rounded-xl text-[#8A2B57]/70 bg-[#8A2B57]/6"
          aria-label="退出"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">{children}</main>

      {bottom && (
        <nav className="safe-pb sticky bottom-0 z-20 px-4 pt-2 bg-white/60 backdrop-blur-md border-t border-[#8A2B57]/10">
          {bottom}
        </nav>
      )}
    </div>
  );
}
