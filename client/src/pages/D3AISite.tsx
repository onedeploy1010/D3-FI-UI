import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useWallet } from "@/contexts/wallet-context";
import { Router } from "@ai/Router";
import { setApiWallet } from "@ai/api-client-react";
import "@ai/index.css";
import "@ai/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function WalletSync() {
  const { wallet } = useWallet();
  useEffect(() => {
    setApiWallet(wallet);
  }, [wallet]);
  return null;
}

export default function D3AISite() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WalletSync />
        <div className="ai-site-root min-h-[100dvh]">
          <Router />
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
