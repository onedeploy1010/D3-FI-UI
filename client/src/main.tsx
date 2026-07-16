import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./contexts/WalletProvider";
import { AppKitProvider } from "./providers/AppKitProvider";
import { ReferralCapture } from "./components/wallet/ReferralCapture";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { Router as WouterRouter } from "wouter";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <AppKitProvider>
      <WalletProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ReferralCapture />
          <App />
        </WouterRouter>
      </WalletProvider>
    </AppKitProvider>
  </LanguageProvider>,
);
