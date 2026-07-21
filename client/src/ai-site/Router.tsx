import { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { MainLayout } from "@ai/components/layout/MainLayout";

// Route-level code splitting: each page (and its heavy deps like recharts /
// lightweight-charts) loads only when navigated to.
const Market = lazy(() => import("@ai/pages/Market"));
const AiHub = lazy(() => import("@ai/pages/AiHub"));
const CopyTrade = lazy(() => import("@ai/pages/CopyTrade"));
const Strategy = lazy(() => import("@ai/pages/Strategy"));
const Settings = lazy(() => import("@ai/pages/Settings"));
const Notifications = lazy(() => import("@ai/pages/Notifications"));
const Projects = lazy(() => import("@ai/pages/Projects"));
const ProjectDetail = lazy(() => import("@ai/pages/Projects/ProjectDetail"));
const Hyperliquid = lazy(() => import("@ai/pages/Projects/Hyperliquid"));
const LegendATM = lazy(() => import("@ai/pages/Projects/LegendATM"));
const Tools = lazy(() => import("@ai/pages/Tools"));

function PageFallback() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center space-y-4 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <span className="font-mono text-xl text-muted-foreground font-bold">404</span>
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">System Node Not Found</h2>
        <p className="text-muted-foreground text-sm max-w-sm">The requested terminal interface does not exist or has been archived.</p>
      </div>
    </div>
  );
}

export function Router() {
  return (
    <MainLayout>
      <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/"><Redirect to="/market" /></Route>
        <Route path="/market" component={Market} />
        <Route path="/ai-hub" component={AiHub} />
        <Route path="/copytrade" component={CopyTrade} />
        <Route path="/strategy" component={Strategy} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/detail/:slug" component={ProjectDetail} />
        <Route path="/projects/hyperliquid/:address?" component={Hyperliquid} />
        <Route path="/projects/legend-atm" component={LegendATM} />
        <Route path="/tools" component={Tools} />
        <Route path="/settings" component={Settings} />
        <Route path="/notifications" component={Notifications} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </MainLayout>
  );
}
