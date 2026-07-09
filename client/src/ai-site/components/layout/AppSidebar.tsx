import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { D3Logo } from "@/components/D3Logo";
import {
  LineChart,
  Cpu,
  Radio,
  GitBranch,
  Settings,
  Bell,
  X,
  ChevronLeft,
  ChevronRight,
  Flame,
  Calculator,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@ai/lib/utils";
import { useIsMobile } from "@ai/hooks/use-mobile";
import { useGetUserProfile, useGetNotifications } from "@ai/api-client-react";
import { useSidebarContext } from "./sidebar-context";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebarContext();

  const { data: profile } = useGetUserProfile();
  const { data: notificationsRaw } = useGetNotifications();
  const notifications = Array.isArray(notificationsRaw) ? notificationsRaw : [];
  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const navGroups = [
    {
      label: t("sidebar.intelligence"),
      items: [
        { path: "/market", label: t("sidebar.market"), icon: LineChart },
        { path: "/strategy", label: t("sidebar.strategyLab"), icon: GitBranch },
        { path: "/ai-hub", label: t("sidebar.aiHub"), icon: Cpu },
        { path: "/copytrade", label: t("sidebar.copyTrade"), icon: Radio },
        { path: "/projects", label: t("sidebar.hotProjects"), icon: Flame },
        { path: "/tools", label: t("sidebar.tools"), icon: Calculator },
      ],
    },
    {
      label: t("sidebar.account"),
      items: [
        { path: "/notifications", label: t("sidebar.notifications"), icon: Bell },
        { path: "/settings", label: t("sidebar.settings"), icon: Settings },
      ],
    },
  ];

  const toggleCollapse = () => setCollapsed(!collapsed);
  const toggleMobile = () => setMobileOpen(!mobileOpen);
  const isCollapsed = collapsed && !isMobile;

  const initials = profile?.username?.substring(0, 2).toUpperCase() || "D3";

  return (
    <>
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={toggleMobile}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen transition-all duration-300 border-r border-sidebar-border bg-sidebar flex flex-col",
          isCollapsed ? "w-[64px]" : "w-[232px]",
          isMobile && !mobileOpen ? "-translate-x-full" : "translate-x-0",
          "lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-14 px-4 border-b border-sidebar-border shrink-0",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsed && (
            <Link href="/market" className="flex items-center gap-2.5 min-w-0">
              <D3Logo size={36} />
              <span className="font-display font-bold text-sidebar-foreground tracking-wide text-[15px] truncate">
                D3<span className="gradient-text-gold">-AI</span>
              </span>
            </Link>
          )}
          {isCollapsed && (
            <Link href="/market">
              <D3Logo size={36} to="/market" />
            </Link>
          )}
          {isMobile && (
            <button
              onClick={toggleMobile}
              className="h-7 w-7 ml-auto flex items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors touch-manipulation"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Back to portal — desktop */}
        {!isCollapsed && (
          <Link
            href="~/portal"
            className="mx-2 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            {t("aiSite.backToPortal", { defaultValue: "返回协议门户" })}
          </Link>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1">
              {!isCollapsed && (
                <div className="px-3 py-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
              )}
              {isCollapsed && <div className="h-3" />}
              {group.items.map((item) => {
                const active =
                  location === item.path || location.startsWith(item.path + "/");
                const hasNotif = item.path === "/notifications" && unreadCount > 0;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => isMobile && setMobileOpen(false)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg nav-item-transition mb-0.5",
                      isCollapsed ? "justify-center" : "",
                      active
                        ? "bg-primary/12 text-sidebar-foreground"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground/90"
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                    )}
                    <item.icon
                      className={cn(
                        "shrink-0 h-[17px] w-[17px]",
                        active ? "text-primary" : "text-current"
                      )}
                    />
                    {!isCollapsed && (
                      <>
                        <span className={cn("text-sm truncate flex-1", active && "font-medium text-sidebar-foreground")}>
                          {item.label}
                        </span>
                        {hasNotif && (
                          <span className="ml-auto h-4 min-w-[16px] rounded-full bg-primary text-[10px] text-white font-bold flex items-center justify-center px-1">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </>
                    )}
                    {isCollapsed && hasNotif && (
                      <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User profile */}
        {!isCollapsed && (
          <div
            className="shrink-0 mx-2 mb-2 p-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 block"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">
                  {initials}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate leading-none mb-1">
                  {profile?.username || t("common.loading")}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-primary/80">{profile?.rank ?? "—"}</span>
                  <span className="text-[10px] text-sidebar-foreground/40">·</span>
                  <span className="text-[10px] text-sidebar-foreground/50 font-mono">α {profile?.alphaScore ?? "—"}</span>
                </div>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="shrink-0 mx-2 mb-2 flex justify-center">
            <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {initials}
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle (desktop only) */}
        {!isMobile && (
          <div className="shrink-0 px-2 pb-2">
            <button
              onClick={toggleCollapse}
              className={cn(
                "w-full flex items-center rounded-md py-2 text-sidebar-foreground/40 hover:text-sidebar-foreground/70 nav-item-transition",
                isCollapsed ? "justify-center" : "gap-2 px-3"
              )}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="text-xs">{t("common.collapse")}</span>
                </>
              )}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
