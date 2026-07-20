import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetExchangeConnections,
  useGetCopyTradeConfigs,
  useGetOrders,
  useGetCopyTradeStats,
  useCreateCopyTradeConfig,
  useUpdateCopyTradeConfig,
  useDeleteCopyTradeConfig,
  useCancelOrder,
} from "@ai/api-client-react";
import type { ExchangeConnection } from "@ai/api-client-react";
import { apiHeaders } from "@ai/api-client-react";
import { aiFetch } from "@/lib/aiApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatPercent, formatCompactNumber, formatDateTime } from "@ai/lib/format";
import { PnlBadge } from "@ai/components/ui-custom/PnlBadge";
import { Copy, Plus, Activity, Pause, Play, Trash2, X, Trophy, Search, Bot, Users, Zap } from "lucide-react";
import { cn } from "@ai/lib/utils";
import { useToast } from "@ai/hooks/use-toast";
import { Leaderboard } from "./Leaderboard";
import { AddressLookup } from "./AddressLookup";
import { AIConsole } from "./AIConsole";
import { CopyConfigDialog } from "./CopyConfigDialog";
import { SmartCopyWatchlist } from "./SmartCopyWatchlist";
import { SmartCopyConfig } from "./SmartCopyConfig";
import { SmartSignalFeed, type ActiveFollow } from "./SmartSignalFeed";
import { usePreference } from "@ai/hooks/usePreference";
import { QuantSignalBots } from "./QuantSignalBots";
import { useTrainedAgents } from "./hooks/useTrainedAgents";
import { useWatchlist } from "./hooks/useWatchlist";
import { motion, AnimatePresence } from "framer-motion";
import type { Trader } from "./types";

function ManageExchangeDialog({
  exchange,
  open,
  onClose,
  onRefetch,
}: {
  exchange: ExchangeConnection | null;
  open: boolean;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (exchange) {
      setTradingEnabled(exchange.tradingEnabled);
      setApiKeyLabel(exchange.name);
    }
  }, [exchange]);

  const handleSave = () => {
    if (!exchange) return;
    const body: { tradingEnabled?: boolean; apiKeyLabel?: string } = {};
    if (tradingEnabled !== exchange.tradingEnabled) body.tradingEnabled = tradingEnabled;
    if (apiKeyLabel !== exchange.name) body.apiKeyLabel = apiKeyLabel;

    setIsSaving(true);
    aiFetch(`/copytrade/exchanges/${exchange.id}`, { method: "PATCH", headers: apiHeaders(), body })
      .then(() => {
        toast({ title: t("copyTrade.exchangeUpdated") });
        onRefetch();
        onClose();
      })
      .catch(() => toast({ title: t("copyTrade.updateFailed"), variant: "destructive" }))
      .finally(() => setIsSaving(false));
  };

  if (!exchange) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("copyTrade.manageExchange")}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{exchange.slug}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="manage-label">{t("copyTrade.label")}</Label>
            <Input
              id="manage-label"
              value={apiKeyLabel}
              onChange={(e) => setApiKeyLabel(e.target.value)}
            />
          </div>
          <div className="bg-muted/30 p-3 rounded-md">
            <p className="text-xs text-muted-foreground mb-1">{t("copyTrade.apiKeyMasked")}</p>
            <p className="font-mono text-sm">{exchange.apiKeyMasked || "••••••••••••••••"}</p>
          </div>
          <div className="flex items-center justify-between p-3 rounded-md border border-border/50">
            <div>
              <p className="text-sm font-medium">{t("copyTrade.enableTrading")}</p>
              <p className="text-xs text-muted-foreground">{t("copyTrade.allowAutoTrade")}</p>
            </div>
            <Switch
              checked={tradingEnabled}
              onCheckedChange={setTradingEnabled}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("copyTrade.cancel")}</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("copyTrade.saving") : t("copyTrade.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewConfigDialog({
  open,
  onClose,
  onRefetch,
  exchanges,
}: {
  open: boolean;
  onClose: () => void;
  onRefetch: () => void;
  exchanges: ExchangeConnection[] | undefined;
}) {
  const { t } = useTranslation();
  const createMut = useCreateCopyTradeConfig();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    allocationPercent: "10",
    maxLeverage: "5",
    stopLossPercent: "5",
    takeProfitPercent: "",
    exchangeId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate(
      {
        data: {
          name: form.name,
          allocationPercent: parseFloat(form.allocationPercent),
          maxLeverage: parseInt(form.maxLeverage, 10),
          stopLossPercent: parseFloat(form.stopLossPercent),
          takeProfitPercent: form.takeProfitPercent ? parseFloat(form.takeProfitPercent) : null,
          exchangeId: form.exchangeId ? parseInt(form.exchangeId, 10) : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("copyTrade.configCreated") });
          onRefetch();
          onClose();
          setForm({ name: "", allocationPercent: "10", maxLeverage: "5", stopLossPercent: "5", takeProfitPercent: "", exchangeId: "" });
        },
        onError: () => toast({ title: t("copyTrade.configCreateFailed"), variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("copyTrade.newCopyTradeConfig")}</DialogTitle>
          <DialogDescription>{t("copyTrade.defineAllocation")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cfg-name">{t("copyTrade.configName")}</Label>
            <Input
              id="cfg-name"
              placeholder="Aggressive BTC Play"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="cfg-alloc">{t("copyTrade.allocationPercent")}</Label>
              <Input
                id="cfg-alloc"
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={form.allocationPercent}
                onChange={(e) => setForm(f => ({ ...f, allocationPercent: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-lev">{t("copyTrade.maxLeverage")}</Label>
              <Input
                id="cfg-lev"
                type="number"
                min="1"
                max="125"
                step="1"
                value={form.maxLeverage}
                onChange={(e) => setForm(f => ({ ...f, maxLeverage: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-sl">{t("copyTrade.stopLossPercent")}</Label>
              <Input
                id="cfg-sl"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={form.stopLossPercent}
                onChange={(e) => setForm(f => ({ ...f, stopLossPercent: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-tp">{t("copyTrade.takeProfitPercent")} <span className="text-muted-foreground">({t("copyTrade.optional")})</span></Label>
              <Input
                id="cfg-tp"
                type="number"
                min="0.1"
                max="1000"
                step="0.1"
                placeholder="—"
                value={form.takeProfitPercent}
                onChange={(e) => setForm(f => ({ ...f, takeProfitPercent: e.target.value }))}
              />
            </div>
          </div>
          {exchanges && exchanges.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="cfg-exchange">{t("copyTrade.exchange")} <span className="text-muted-foreground">({t("copyTrade.optional")})</span></Label>
              <select
                id="cfg-exchange"
                value={form.exchangeId}
                onChange={(e) => setForm(f => ({ ...f, exchangeId: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t("copyTrade.noSpecificExchange")}</option>
                {exchanges.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("copyTrade.cancel")}</Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create Config"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CopyTrade() {
  const { t } = useTranslation();
  const { data: exchanges = [], isLoading: isLoadingExchanges, refetch: refetchExchanges } = useGetExchangeConnections();
  const { data: configs = [], isLoading: isLoadingConfigs, refetch: refetchConfigs } = useGetCopyTradeConfigs();
  const { data: stats = { totalPnl: 0, winRate: 0, activeConfigs: 0, totalTrades: 0, sharpeRatio: 0, maxDrawdown: 0 }, isLoading: isLoadingStats } = useGetCopyTradeStats();
  const { data: orders = [], isLoading: isLoadingOrders } = useGetOrders({ limit: 50 });
  const updateConfig = useUpdateCopyTradeConfig();
  const deleteConfig = useDeleteCopyTradeConfig();
  const { toast } = useToast();

  const cancelOrder = useCancelOrder();
  const [orderTab, setOrderTab] = useState("all");
  const [manageExchange, setManageExchange] = useState<ExchangeConnection | null>(null);
  const [manageExchangeOpen, setManageExchangeOpen] = useState(false);
  const [newConfigOpen, setNewConfigOpen] = useState(false);
  const [deleteConfigId, setDeleteConfigId] = useState<number | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  // ── Two-mode state ────────────────────────────────────────────────────────
  const [mode, setMode] = useState<"smart" | "quant">("smart");
  const [smartTab, setSmartTab] = useState<"rankings" | "watchlist" | "config" | "signals" | "lookup" | "ai">("rankings");
  const [activeFollow, setActiveFollow] = usePreference<ActiveFollow | null>("smart_follow", null);

  const startFollow = (follow: ActiveFollow) => {
    setActiveFollow(follow);
    setSmartTab("signals");
  };

  const stopFollow = () => {
    setActiveFollow(null);
    toast({ title: t("copyTrade.sfStopped") });
  };
  const [copyTrader, setCopyTrader] = useState<Trader | null>(null);
  const [copyConfigOpen, setCopyConfigOpen] = useState(false);
  const { agents: trainedAgents } = useTrainedAgents();

  const { entries: watchlist, add: addToWatchlist, remove: removeFromWatchlist, toggle: toggleWatchlist, setAllocation: setWatchlistAlloc, has: inWatchlist } = useWatchlist();

  const handleCopyTrader = (trader: Trader) => {
    setCopyTrader(trader);
    setCopyConfigOpen(true);
  };

  const handleAddWatchlist = (trader: Trader) => {
    addToWatchlist(trader);
    toast({ title: t("copyTrade.addedToWatchlist"), description: `${trader.name} ${t("copyTrade.isBeingTracked")}` });
  };

  const filteredOrders = orders?.filter(o =>
    orderTab === "all" ? true :
    orderTab === "open" ? o.status === "open" :
    o.status !== "open"
  );

  const handleToggleConfig = (id: number, isActive: boolean) => {
    updateConfig.mutate(
      { id, data: { isActive: !isActive } },
      {
        onSuccess: () => {
          toast({ title: !isActive ? t("copyTrade.configResumed") : t("copyTrade.configPaused") });
          refetchConfigs();
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleDeleteConfig = (id: number) => {
    deleteConfig.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: t("copyTrade.configDeleted") });
          refetchConfigs();
          setDeleteConfigId(null);
        },
        onError: () => toast({ title: t("copyTrade.deleteFailed"), variant: "destructive" }),
      }
    );
  };

  const handleOpenManage = (ex: ExchangeConnection) => {
    setManageExchange(ex);
    setManageExchangeOpen(true);
  };

  const handleDeleteExchange = (id: number) => {
    aiFetch(`/copytrade/exchanges/${id}`, { method: "DELETE", headers: apiHeaders() })
      .then(() => {
        toast({ title: t("copyTrade.exchangeRemoved") });
        refetchExchanges();
      })
      .catch(() => toast({ title: t("copyTrade.exchangeRemoveFailed"), variant: "destructive" }));
  };

  const handleCancelOrder = (id: number) => {
    cancelOrder.mutate({ id }, {
      onSuccess: () => {
        toast({ title: t("copyTrade.orderCancelled") });
        setCancelOrderId(null);
      },
      onError: () => toast({ title: t("copyTrade.cancelFailed"), variant: "destructive" }),
    });
  };

  const SMART_TABS = [
    { key: "rankings" as const, label: t("copyTrade.tabRankings"), icon: <Trophy className="h-3.5 w-3.5" /> },
    { key: "watchlist" as const, label: `${t("copyTrade.tabWatchlist")} ${watchlist.length > 0 ? `(${watchlist.length})` : ""}`, icon: <Users className="h-3.5 w-3.5" /> },
    { key: "config" as const, label: t("copyTrade.tabConfig"), icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "signals" as const, label: t("copyTrade.tabSignals"), icon: <Zap className="h-3.5 w-3.5" />, live: !!activeFollow },
    { key: "lookup" as const, label: t("copyTrade.tabLookup"), icon: <Search className="h-3.5 w-3.5" /> },
    { key: "ai" as const, label: t("copyTrade.tabAiConsole"), icon: <Bot className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5 pb-24 sm:pb-10 min-h-[calc(100dvh-80px)]">
      {/* ── Top header + mode switcher ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display flex items-center gap-3">
            <Copy className="h-6 w-6 sm:h-7 sm:w-7 text-gold shrink-0" />
            {t("copyTrade.title")}
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">{t("copyTrade.subtitle")}</p>
        </div>
      </motion.div>

      {/* ── Mode Switcher ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-3">
        {[
          {
            key: "smart" as const,
            label: t("copyTrade.smartCopy"),
            sub: t("copyTrade.smartCopySub"),
            icon: <Trophy className="h-5 w-5" />,
            color: "from-gold/15 to-amber-500/5",
            border: "border-gold/30",
            glow: "shadow-[0_0_24px_rgba(218,165,32,0.2)]",
          },
          {
            key: "quant" as const,
            label: t("copyTrade.quantBots"),
            sub: t("copyTrade.quantBotsSub"),
            icon: <Bot className="h-5 w-5" />,
            color: "from-crimson/15 to-rose-800/5",
            border: "border-crimson/30",
            glow: "shadow-[0_0_24px_rgba(200,50,50,0.2)]",
          },
        ].map(m => (
          <motion.button key={m.key} onClick={() => setMode(m.key)}
            whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-2xl border p-3 sm:p-5 text-left transition-all",
              mode === m.key ? `bg-gradient-to-br ${m.color} ${m.border} ${m.glow}` : "border-border/30 bg-white/3 hover:border-border/60"
            )}>
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className={cn("w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0",
                mode === m.key ? (m.key === "smart" ? "bg-gold/20 text-gold" : "bg-crimson/20 text-crimson") : "bg-white/5 text-muted-foreground"
              )}>
                {m.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("font-black text-sm sm:text-lg leading-tight break-words", mode === m.key ? (m.key === "smart" ? "text-gold" : "text-crimson") : "text-foreground")}>
                  {m.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{m.sub}</div>
              </div>
              {mode === m.key && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className={cn("ml-auto hidden sm:block shrink-0 w-2.5 h-2.5 rounded-full", m.key === "smart" ? "bg-gold" : "bg-crimson")} />
              )}
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* ── Sub-tabs ── */}
      <AnimatePresence mode="wait">
        {mode === "smart" ? (
          <motion.div key="smart" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Smart Copy sub-tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
              {SMART_TABS.map(tb => (
                <button key={tb.key} onClick={() => setSmartTab(tb.key)}
                  className={cn("flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border font-semibold whitespace-nowrap transition-all shrink-0",
                    smartTab === tb.key
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-white/3 text-muted-foreground border-border/30 hover:border-border/60"
                  )}>
                  {tb.icon} {tb.label}
                  {"live" in tb && tb.live && (
                    <span className="relative flex h-1.5 w-1.5 ml-0.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {smartTab === "rankings" && (
                <motion.div key="rankings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Leaderboard
                    onCopyTrader={handleCopyTrader}
                    onAddWatchlist={handleAddWatchlist}
                    watchlistAddresses={watchlist.map(e => e.trader.address)}
                  />
                </motion.div>
              )}
              {smartTab === "watchlist" && (
                <motion.div key="watchlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SmartCopyWatchlist
                    entries={watchlist}
                    onRemove={removeFromWatchlist}
                    onToggle={toggleWatchlist}
                    onSetAllocation={setWatchlistAlloc}
                    onFollowAll={() => setSmartTab("config")}
                  />
                </motion.div>
              )}
              {smartTab === "config" && (
                <motion.div key="config" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SmartCopyConfig
                    entries={watchlist}
                    onFollow={follow => {
                      toast({ title: t("copyTrade.copyTradeActivated") });
                      startFollow(follow);
                    }}
                  />
                </motion.div>
              )}
              {smartTab === "signals" && (
                <motion.div key="signals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SmartSignalFeed
                    entries={watchlist}
                    activeFollow={activeFollow}
                    onStop={stopFollow}
                    onGoRankings={() => setSmartTab("rankings")}
                    onGoConfig={() => setSmartTab("config")}
                  />
                </motion.div>
              )}
              {smartTab === "lookup" && (
                <motion.div key="lookup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <AddressLookup onCopyTrader={handleCopyTrader} />
                </motion.div>
              )}
              {smartTab === "ai" && (
                <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <AIConsole />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="quant" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <QuantSignalBots agents={trainedAgents} standalone />
          </motion.div>
        )}
      </AnimatePresence>

        {false && <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoadingStats ? (
          Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : stats && (
          <>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total PNL</span>
                <div>
                  <PnlBadge value={stats.totalPnl} type="currency" className="text-2xl font-bold font-mono tracking-tight" />
                  <p className="text-xs text-muted-foreground mt-1">All time return</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sharpe Ratio</span>
                <div>
                  <div className="text-2xl font-bold tracking-tight font-mono">{stats.sharpeRatio.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Risk adjusted</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</span>
                <div>
                  <div className="text-2xl font-bold tracking-tight font-mono">{formatPercent(stats.winRate, 1, false)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Risk-adjusted</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border/50">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Max Drawdown</span>
                <div>
                  <div className="text-2xl font-bold tracking-tight font-mono text-red-500">-{formatPercent(stats.maxDrawdown, 2, false)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Peak to trough</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3 border-b border-border/20">
              <CardTitle className="text-sm font-medium">Exchange APIs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingExchanges ? (
                <div className="p-4 space-y-3">
                  {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : exchanges && exchanges.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {exchanges.map(ex => (
                    <div key={ex.id} className="p-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          ex.isConnected && ex.tradingEnabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
                          ex.isConnected ? "bg-yellow-500" : "bg-red-500"
                        )} />
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate">{ex.name}</h4>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            {ex.balance ? formatCurrency(ex.balance) : "---"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleOpenManage(ex)}>Manage</Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteExchange(ex.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">No connected exchanges</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3 border-b border-border/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Active Configs</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setNewConfigOpen(true)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingConfigs ? (
                <div className="p-4 space-y-3">
                  {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : configs && configs.length > 0 ? (
                <div className="divide-y divide-border/20">
                  {configs.map(config => (
                    <div key={config.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm truncate mr-2">{config.name}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-1.5 py-0",
                            config.isActive ? "text-primary border-primary/30 bg-primary/10" : "text-muted-foreground border-border"
                          )}>
                            {config.isActive ? "ACTIVE" : "PAUSED"}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title={config.isActive ? "Pause" : "Resume"}
                            onClick={() => handleToggleConfig(config.id, config.isActive)}
                            disabled={updateConfig.isPending}
                          >
                            {config.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title={t("copyTrade.delete")}
                            onClick={() => setDeleteConfigId(config.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between bg-muted/30 px-2 py-1 rounded">
                          <span className="text-muted-foreground">Alloc</span>
                          <span className="font-mono font-medium">{config.allocationPercent}%</span>
                        </div>
                        <div className="flex justify-between bg-muted/30 px-2 py-1 rounded">
                          <span className="text-muted-foreground">Max Lev</span>
                          <span className="font-mono font-medium">{config.maxLeverage}x</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">No active configurations</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2 border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-0 border-b border-border/20">
            <div className="flex items-center justify-between gap-3 pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 shrink-0">
                <Activity className="h-4 w-4 text-primary" />
                Execution Log
              </CardTitle>
              <Tabs value={orderTab} onValueChange={setOrderTab} className="w-auto">
                <TabsList className="grid grid-cols-3 h-8 w-[220px] sm:w-[280px]">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="open" className="text-xs">Open</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingOrders ? (
              <div className="p-4 space-y-3">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filteredOrders && filteredOrders.length > 0 ? (
              <>
                {/* Desktop table — hidden on mobile */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 text-muted-foreground text-[10px] uppercase tracking-wider text-left border-b border-border/20">
                        <th className="py-2 pl-4 font-medium">Time/Asset</th>
                        <th className="py-2 font-medium">Action</th>
                        <th className="py-2 font-medium text-right">Price/Qty</th>
                        <th className="py-2 font-medium text-right">AI Score</th>
                        <th className="py-2 font-medium text-right pr-4">Status/PNL</th>
                        <th className="py-2 font-medium w-10 pr-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 pl-4">
                            <div className="font-bold">{order.symbol}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{formatDateTime(order.createdAt)}</div>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={cn(
                                "text-[10px] px-1.5 py-0 border-0 rounded-sm font-bold uppercase",
                                order.side === "buy" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                              )}>
                                {order.side}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground uppercase">{order.type}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <div className="font-mono">{order.price ? formatCurrency(order.price, 4) : "MARKET"}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Vol: {formatCompactNumber(order.quantity)}</div>
                          </td>
                          <td className="py-3 text-right">
                            {order.aiScore ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  {order.aiScore.toFixed(1)}
                                </span>
                                {order.aiReason && <span className="text-[9px] text-muted-foreground mt-1 truncate max-w-[80px]" title={order.aiReason}>{order.aiReason}</span>}
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-3 text-right pr-4">
                            {order.status === "open" ? (
                              <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30">OPEN</Badge>
                            ) : order.status === "cancelled" || order.status === "rejected" ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">CANCELLED</Badge>
                            ) : (
                              <PnlBadge value={order.pnl} type="currency" />
                            )}
                          </td>
                          <td className="py-3 pr-2">
                            {order.status === "open" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title={t("copyTrade.cancelOrder")}
                                onClick={() => setCancelOrderId(order.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list — visible only on mobile */}
                <div className="md:hidden divide-y divide-border/20">
                  {filteredOrders.map(order => (
                    <div key={order.id} className="p-3 hover:bg-muted/30 transition-colors">
                      {/* Row 1: symbol + side + status + cancel */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm truncate">{order.symbol}</span>
                          <Badge variant="outline" className={cn(
                            "text-[10px] px-1.5 py-0 border-0 rounded-sm font-bold uppercase shrink-0",
                            order.side === "buy" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {order.side}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground uppercase shrink-0">{order.type}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {order.status === "open" ? (
                            <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30">OPEN</Badge>
                          ) : order.status === "cancelled" || order.status === "rejected" ? (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">CANCELLED</Badge>
                          ) : (
                            <PnlBadge value={order.pnl} type="currency" />
                          )}
                          {order.status === "open" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setCancelOrderId(order.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Row 2: price · qty · time */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono flex-wrap">
                        <span>{order.price ? formatCurrency(order.price, 4) : "MARKET"}</span>
                        <span className="text-border">·</span>
                        <span>Vol: {formatCompactNumber(order.quantity)}</span>
                        <span className="text-border">·</span>
                        <span>{formatDateTime(order.createdAt)}</span>
                        {order.aiScore && (
                          <>
                            <span className="text-border">·</span>
                            <span className="bg-primary/10 text-primary px-1 rounded">AI {order.aiScore.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">No execution history found</div>
            )}
          </CardContent>
        </Card>
      </div></div>}

      <CopyConfigDialog
        open={copyConfigOpen}
        trader={copyTrader}
        onClose={() => setCopyConfigOpen(false)}
      />

      <ManageExchangeDialog
        exchange={manageExchange}
        open={manageExchangeOpen}
        onClose={() => setManageExchangeOpen(false)}
        onRefetch={refetchExchanges}
      />

      <NewConfigDialog
        open={newConfigOpen}
        onClose={() => setNewConfigOpen(false)}
        onRefetch={refetchConfigs}
        exchanges={exchanges}
      />

      <AlertDialog open={deleteConfigId !== null} onOpenChange={(o) => { if (!o) setDeleteConfigId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Config?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the copy-trade configuration. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfigId !== null) handleDeleteConfig(deleteConfigId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelOrderId !== null} onOpenChange={(o) => { if (!o) setCancelOrderId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the open order. If it has been partially filled, only the remaining portion will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (cancelOrderId !== null) handleCancelOrder(cancelOrderId); }}
              disabled={cancelOrder.isPending}
            >
              {cancelOrder.isPending ? "Cancelling..." : "Cancel Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
