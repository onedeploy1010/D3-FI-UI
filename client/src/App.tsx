import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Landing from "./pages/Landing";
import Portal from "./pages/Portal";
import D3Fi from "./pages/D3Fi";
import BribeeUnion from "./pages/BribeeUnion";
import PartnerProgram from "./pages/PartnerProgram";
import D3AISite from "./pages/D3AISite";
import FakeToken from "./pages/FakeToken";
import HbPreview from "./pages/HbPreview";
import { ReferralBindGate } from "@/components/wallet/ReferralBindGate";
import { ReferralLanding } from "@/components/wallet/ReferralLanding";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Landing} />
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
            <Route path="/faketoken" component={FakeToken} />
            <Route path="/hb-preview" component={HbPreview} />
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
