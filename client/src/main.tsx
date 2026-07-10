import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./contexts/WalletContext";
import { PrivyAppProvider } from "./providers/PrivyAppProvider";
import { ReferralCapture } from "./components/wallet/ReferralCapture";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { Router as WouterRouter } from "wouter";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <PrivyAppProvider>
      <WalletProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ReferralCapture />
          <App />
        </WouterRouter>
      </WalletProvider>
    </PrivyAppProvider>
  </LanguageProvider>,
);
