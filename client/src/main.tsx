import { createRoot } from "react-dom/client";
import App from "./App";
import { PrivyAppProvider } from "./providers/PrivyAppProvider";
import { ReferralCapture } from "./components/wallet/ReferralCapture";
import { Router as WouterRouter } from "wouter";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <PrivyAppProvider>
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <ReferralCapture />
      <App />
    </WouterRouter>
  </PrivyAppProvider>,
);
