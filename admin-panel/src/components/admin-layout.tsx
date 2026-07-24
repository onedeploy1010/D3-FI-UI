import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAdminAuth } from '@/contexts/admin-auth';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Shield,
  ShieldAlert,
  Layers,
  Headphones,
  ScrollText,
  ArrowLeftRight,
  KeyRound,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

// Each page requires its `.read` permission — items the user can't read are
// hidden (the backend independently enforces the same permission per API).
const NAV = [
  { href: '/dashboard', label: '仪表盘', sub: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.read' },
  { href: '/members', label: '会员管理', sub: 'Members', icon: Users, perm: 'members.read' },
  { href: '/referrals', label: '推荐管理', sub: 'Referrals', icon: GitBranch, perm: 'referrals.read' },
  { href: '/partners', label: '合伙人管理', sub: 'Partners', icon: Shield, perm: 'partners.read' },
  { href: '/stakes', label: '质押管理', sub: 'Stakes', icon: Layers, perm: 'stakes.read' },
  { href: '/transactions', label: '交易管理', sub: 'Transactions', icon: ArrowLeftRight, perm: 'transactions.read' },
  { href: '/subsidies', label: '补贴工单', sub: 'Subsidies', icon: Headphones, perm: 'subsidies.read' },
  { href: '/roles', label: '角色权限', sub: 'Roles', icon: KeyRound, perm: 'admins.read' },
  { href: '/logs', label: '操作日志', sub: 'Logs', icon: ScrollText, perm: 'logs.read' },
  { href: '/security', label: '安全中心', sub: 'Security', icon: ShieldAlert, perm: 'security.read' },
  { href: '/params', label: '参数管理', sub: 'Parameters', icon: SlidersHorizontal, perm: 'params.read' },
] as const;

function isActive(location: string, href: string) {
  if (href === '/dashboard') return location === '/' || location === href;
  return location === href || location.startsWith(`${href}/`);
}

function NavList({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  const { user } = useAdminAuth();
  const visible = NAV.filter(
    ({ perm }) =>
      user?.role === 'superadmin' || (user?.permissions ?? []).includes(perm),
  );
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {visible.map(({ href, label, sub, icon: Icon }) => {
        const active = isActive(location, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-3 py-3 rounded-lg transition-all min-h-[44px] ${
              active
                ? 'bg-gradient-to-r from-[#E0568F]/20 via-[#E0568F]/10 to-transparent text-foreground border border-[#E0568F]/30'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60 border border-transparent'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#E0568F]' : 'text-muted-foreground'}`} />
            <div className="min-w-0">
              <p className={`text-sm truncate ${active ? 'font-bold' : 'font-medium'}`}>{label}</p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAdminAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-sidebar border-r border-sidebar-border sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded-full bg-[#E0568F]/20 border border-[#E0568F]/40 flex items-center justify-center">
            <span className="text-[#E0568F] text-xs font-bold">D3</span>
          </div>
          <div>
            <p className="text-sm font-bold">D3 合伙人</p>
            <p className="text-[10px] text-muted-foreground">Admin Panel</p>
          </div>
        </div>
        <NavList location={location} />
        <div className="px-4 py-4 border-t border-sidebar-border">
          <p className="text-sm font-medium truncate mb-2">{user?.username}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-12 bg-sidebar/95 backdrop-blur border-b flex items-center justify-between px-3">
        <button type="button" onClick={() => setDrawerOpen(true)} className="p-2">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold">D3 Admin</span>
        <div className="w-9" />
      </div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setDrawerOpen(false)}>
          <aside
            className="absolute left-0 top-0 h-full w-64 flex flex-col bg-sidebar border-r"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <button type="button" onClick={() => setDrawerOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList location={location} onNavigate={() => setDrawerOpen(false)} />
            <div className="px-4 py-4 border-t border-sidebar-border">
              <p className="text-sm font-medium truncate mb-2">{user?.username}</p>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  void logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-x-hidden pt-12 lg:pt-0">{children}</main>
    </div>
  );
}
