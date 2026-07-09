import { Switch, Route, Redirect } from "wouter";
import { MainLayout } from "@ai/components/layout/MainLayout";
import Market from "@ai/pages/Market";
import AiHub from "@ai/pages/AiHub";
import CopyTrade from "@ai/pages/CopyTrade";
import Strategy from "@ai/pages/Strategy";
import Settings from "@ai/pages/Settings";
import Notifications from "@ai/pages/Notifications";
import Projects from "@ai/pages/Projects";
import ProjectDetail from "@ai/pages/Projects/ProjectDetail";
import Hyperliquid from "@ai/pages/Projects/Hyperliquid";
import LegendATM from "@ai/pages/Projects/LegendATM";
import Rune from "@ai/pages/Projects/Rune";
import Tools from "@ai/pages/Tools";

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
        <Route path="/projects/rune" component={Rune} />
        <Route path="/tools" component={Tools} />
        <Route path="/settings" component={Settings} />
        <Route path="/notifications" component={Notifications} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}
