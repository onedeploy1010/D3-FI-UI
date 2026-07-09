import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LineChart, Cpu, Radio, Flame, MoreHorizontal } from "lucide-react";
import { cn } from "@ai/lib/utils";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GitBranch, Calculator, Bell, Settings, ArrowLeft } from "lucide-react";

const PRIMARY_TABS = [
  { path: "/market", labelKey: "sidebar.market", icon: LineChart },
  { path: "/ai-hub", labelKey: "sidebar.aiHub", icon: Cpu },
  { path: "/copytrade", labelKey: "sidebar.copyTrade", icon: Radio },
  { path: "/projects", labelKey: "sidebar.hotProjects", icon: Flame },
] as const;

const MORE_ITEMS = [
  { path: "/strategy", labelKey: "sidebar.strategyLab", icon: GitBranch },
  { path: "/tools", labelKey: "sidebar.tools", icon: Calculator },
  { path: "/notifications", labelKey: "sidebar.notifications", icon: Bell },
  { path: "/settings", labelKey: "sidebar.settings", icon: Settings },
] as const;

export function MobileBottomNav() {
  const [location, navigate] = useLocation();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_ITEMS.some(
    (item) => location === item.path || location.startsWith(item.path + "/"),
  );

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-50 lg:hidden border-t border-border/80 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-5 h-14 max-w-lg mx-auto">
          {PRIMARY_TABS.map((tab) => {
            const active = location === tab.path || location.startsWith(tab.path + "/");
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-h-[44px] touch-manipulation transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <tab.icon className={cn("h-5 w-5", active && "scale-110")} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-semibold leading-none truncate max-w-[4.5rem]">
                  {t(tab.labelKey).replace(/分析|中心|引擎/, "").trim() || t(tab.labelKey)}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-h-[44px] touch-manipulation transition-colors",
              isMoreActive || moreOpen ? "text-primary" : "text-muted-foreground",
            )}
            aria-label={t("common.more", { defaultValue: "更多" })}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={isMoreActive ? 2.5 : 2} />
            <span className="text-[10px] font-semibold leading-none">
              {t("common.more", { defaultValue: "更多" })}
            </span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-base font-bold">{t("sidebar.account")}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {MORE_ITEMS.map((item) => {
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border min-h-[52px] touch-manipulation transition-colors",
                    active
                      ? "border-primary/30 bg-primary/8 text-primary"
                      : "border-border/60 bg-card hover:bg-muted/50",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              navigate("~/portal");
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted/50 touch-manipulation min-h-[48px]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("aiSite.backToPortal", { defaultValue: "返回协议门户" })}
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
