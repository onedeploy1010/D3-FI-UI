import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readDemoWalletFromSession } from "@/lib/demoWallet";

export const DEMO_WALLET = "0x1234567890abcdef1234567890abcdef12345678";

let activeWallet: string | null = null;

/** Sync connected wallet for API requests (call from D3AISite). */
export function setApiWallet(wallet: string | null) {
  activeWallet = wallet;
}

export function apiHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "X-Wallet-Address": readDemoWalletFromSession() ?? activeWallet ?? DEMO_WALLET,
    ...extra,
  };
}

export type CreateStrategyBodyRiskLevel = "low" | "medium" | "high";

export type ExchangeConnection = {
  id: number;
  name: string;
  slug: string;
  tradingEnabled: boolean;
  apiKeyMasked?: string;
  isConnected: boolean;
  balance: number;
  exchange: string;
};

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: apiHeaders() });
  if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: "PUT",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

export function useGetUserProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => apiGet("/user/profile"),
    staleTime: 60_000,
  });
}

export function useGetNotifications(opts?: { unreadOnly?: boolean }) {
  return useQuery({
    queryKey: ["notifications", opts?.unreadOnly ?? false],
    queryFn: () => apiGet(`/notifications${opts?.unreadOnly ? "?unreadOnly=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiPost(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useGetAiHubStatus() {
  return useQuery({
    queryKey: ["ai-hub-status"],
    queryFn: () => apiGet("/ai-hub/status"),
    refetchInterval: 60_000,
  });
}

export function useGetSimLeaderboard(opts?: { limit?: number }) {
  return useQuery({
    queryKey: ["sim-leaderboard", opts?.limit ?? 10],
    queryFn: () => apiGet("/ai-hub/leaderboard"),
    staleTime: 60_000,
  });
}

export function useGetSimulationRuns() {
  return useQuery({
    queryKey: ["sim-runs"],
    queryFn: () => apiGet("/ai-hub/sim-runs"),
    staleTime: 30_000,
  });
}

export function useGetMarketSentiment() {
  return useQuery({
    queryKey: ["market-sentiment"],
    queryFn: () => apiGet("/market/sentiment"),
    refetchInterval: 60_000,
  });
}

export function useGetWatchlistSymbols() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: () => apiGet("/market/watchlist"),
    refetchInterval: 30_000,
  });
}

export function useGetMarketNews(opts?: { limit?: number }) {
  return useQuery({
    queryKey: ["market-news", opts?.limit ?? 10],
    queryFn: () => apiGet(`/market/news`),
    staleTime: 5 * 60_000,
  });
}

export function useGetStrategyCatalog() {
  return useQuery({
    queryKey: ["strategies", "catalog"],
    queryFn: () => apiGet<{ strategies: unknown[] }>("/strategies/catalog"),
    staleTime: 5 * 60_000,
  });
}

export function useGetUserStrategies() {
  return useQuery({
    queryKey: ["strategies", "user"],
    queryFn: () => apiGet<{ ownedIds: string[]; owned: unknown[]; knowledgeBase: string[]; tokens: number }>("/strategies/user"),
    staleTime: 10_000,
  });
}

export function useGetPlatformAgents() {
  return useQuery({
    queryKey: ["agents", "platform"],
    queryFn: () => apiGet<{ agents: unknown[] }>("/agents/platform"),
    refetchInterval: 60_000,
  });
}

export function useGetUserAgents() {
  return useQuery({
    queryKey: ["agents", "user"],
    queryFn: () => apiGet<{ agents: unknown[] }>("/agents/user"),
    staleTime: 10_000,
  });
}

export function useSaveUserAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agents: unknown[]) => apiPut("/agents/user", { agents }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents", "user"] }),
  });
}

export function useCreateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { data: { name: string; description: string; riskLevel: CreateStrategyBodyRiskLevel; tags: string[] } }) =>
      apiPost("/strategies", vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["strategies"] }),
  });
}

export function useGetExchangeConnections() {
  return useQuery({
    queryKey: ["exchanges"],
    queryFn: () => apiGet<ExchangeConnection[]>("/copytrade/exchanges"),
    staleTime: 30_000,
  });
}

export function useGetCopyTradeConfigs() {
  return useQuery({
    queryKey: ["copy-configs"],
    queryFn: () => apiGet("/copytrade/configs"),
    staleTime: 15_000,
  });
}

export function useGetCopyTradeStats() {
  return useQuery({
    queryKey: ["copy-stats"],
    queryFn: () => apiGet("/copytrade/stats"),
    staleTime: 15_000,
  });
}

export function useGetOrders(opts?: { limit?: number }) {
  return useQuery({
    queryKey: ["orders", opts?.limit ?? 50],
    queryFn: () => apiGet("/copytrade/orders"),
    staleTime: 10_000,
  });
}

export function useCreateCopyTradeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { data: Record<string, unknown> }) => apiPost("/copytrade/configs", vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copy-configs"] }),
  });
}

export function useUpdateCopyTradeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`/api/copytrade/configs/${id}`, {
        method: "PATCH",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copy-configs"] }),
  });
}

export function useDeleteCopyTradeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      fetch(`/api/copytrade/configs/${id}`, { method: "DELETE", headers: apiHeaders() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copy-configs"] }),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiPost(`/copytrade/orders/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
