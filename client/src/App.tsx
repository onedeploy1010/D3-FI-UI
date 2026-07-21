import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Landing from "./pages/Landing";
import { ReferralBindGate } from "@/components/wallet/ReferralBindGate";
import { ReferralLanding } from "@/components/wallet/ReferralLanding";

// Route-level code splitting: each app (dapp / union / partner / AI site) is its
// own chunk so visiting one page doesn't download the others' dependencies.
const Portal = lazy(() => import("./pages/Portal"));
const D3Fi = lazy(() => import("./pages/D3Fi"));
const BribeeUnion = lazy(() => import("./pages/BribeeUnion"));
const PartnerProgram = lazy(() => import("./pages/PartnerProgram"));
const D3AISite = lazy(() => import("./pages/D3AISite"));
const FakeToken = lazy(() => import("./pages/FakeToken"));
const HbPreview = lazy(() => import("./pages/HbPreview"));

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}


function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* Production "/" is served the standalone marketing page (dist/public/index.html);
          the React landing lives at /app and stays reachable via client-side nav on "/". */}
      <Route path={"/"} component={Landing} />
      <Route path={"/app"} component={Landing} />
      <Route path={"/portal"} component={Portal} />
      <Route path={"/r/:wallet"} component={ReferralLanding} />
      <Route path={"/union/r/:wallet"} component={ReferralLanding} />
      <Route path={"/d3fi"} component={D3Fi} />
      <Route path={"/union"} component={BribeeUnion} />
      <Route path={"/partner"} component={PartnerProgram} />
      <Route path={"/partner/r/:wallet"} component={ReferralLanding} />
      <Route path="/ai" nest>
        <D3AISite />
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={false}>
        <TooltipProvider>
          <Toaster />
          <Switch>
            {/* Test-token faucet: ungated so testers can claim before binding a referral. */}
            <Route path="/faketoken">
              <Suspense fallback={<RouteFallback />}><FakeToken /></Suspense>
            </Route>
            <Route path="/hb-preview">
              <Suspense fallback={<RouteFallback />}><HbPreview /></Suspense>
            </Route>
            <Route>
              <ReferralBindGate>
                <Router />
              </ReferralBindGate>
            </Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
