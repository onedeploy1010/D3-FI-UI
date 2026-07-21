import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetExchangeConnections,
  useGetCopyTradeConfigs,
  useCreateCopyTradeConfig,
  useUpdateCopyTradeConfig,
  useDeleteCopyTradeConfig,
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
  const updateConfig = useUpdateCopyTradeConfig();
  const deleteConfig = useDeleteCopyTradeConfig();
  const { toast } = useToast();

  const [manageExchange, setManageExchange] = useState<ExchangeConnection | null>(null);
  const [manageExchangeOpen, setManageExchangeOpen] = useState(false);
  const [newConfigOpen, setNewConfigOpen] = useState(false);
  const [deleteConfigId, setDeleteConfigId] = useState<number | null>(null);

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

    </div>
  );
}
