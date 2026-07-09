import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { useIsMobile } from "@ai/hooks/use-mobile";
import { SidebarProvider, useSidebarContext } from "./sidebar-context";

function LayoutInner({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { collapsed } = useSidebarContext();
  const isCollapsed = collapsed && !isMobile;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-primary/30">
      {/* Desktop sidebar — hidden on mobile (bottom nav instead) */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      <div
        className="flex-1 flex flex-col min-w-0 transition-[padding] duration-300"
        style={{ paddingLeft: isMobile ? 0 : isCollapsed ? 64 : 232 }}
      >
        <AppHeader />
        <main
          className="flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:p-6 w-full max-w-[1600px] mx-auto overflow-y-auto overflow-x-hidden"
          style={{
            paddingBottom: isMobile
              ? "calc(4.5rem + max(0.5rem, env(safe-area-inset-bottom)))"
              : undefined,
          }}
        >
          {children}
        </main>
      </div>

      {isMobile && <MobileBottomNav />}
    </div>
  );
}

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
