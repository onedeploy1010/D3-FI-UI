import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useGetUserProfile } from "@ai/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, TrendingUp, TrendingDown, ArrowLeft } from "lucide-react";
import { useIsMobile } from "@ai/hooks/use-mobile";
import { useSidebarContext } from "./sidebar-context";
import { cn } from "@ai/lib/utils";
import { Link } from "wouter";
import { marketFetch } from "@/lib/marketApi";

// ── Live prices for header ticker ─────────────────────────────────────────────
type NavPrice = { sym: string; price: number; change24h: number; dir: "up" | "down" | null; flashKey: number };
const NAV_SYMS = ["BTC", "ETH", "BNB", "AVAX", "ARB"];
const SEED: NavPrice[] = NAV_SYMS.map(sym => ({ sym, price: 0, change24h: 0, dir: null, flashKey: 0 }));

function useHeaderPrices() {
  const [prices, setPrices] = useState<NavPrice[]>(SEED);
  const [source, setSource] = useState<"ws" | "rest">("rest");
  const srcRef = useRef<"ws" | "rest">("rest");

  const fetchRest = async () => {
    try {
      const list = await marketFetch<{ sym: string; price: number; change24h: number }[]>("/live-prices");
      if (!list?.length) return;
      srcRef.current = "rest"; setSource("rest");
      setPrices(prev => prev.map(p => {
        const d = list.find(x => x.sym === p.sym);
        if (!d?.price) return p;
        const dir: NavPrice["dir"] = p.price > 0 ? (d.price > p.price ? "up" : "down") : null;
        return { ...p, price: d.price, change24h: d.change24h, dir, flashKey: p.price > 0 && d.price !== p.price ? p.flashKey + 1 : p.flashKey };
      }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const streams = NAV_SYMS.map(s => `${s.toLowerCase()}usdt@miniTicker`).join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    let ws: WebSocket | null = null; let failCount = 0; let dead = false;
    const symMap: Record<string, string> = { btcusdt: "BTC", ethusdt: "ETH", bnbusdt: "BNB", avaxusdt: "AVAX", arbusdt: "ARB" };
    function connect() {
      if (dead) return;
      const at = Date.now();
      ws = new WebSocket(url);
      ws.onopen = () => { failCount = 0; srcRef.current = "ws"; setSource("ws"); };
      ws.onmessage = (ev) => {
        try {
          const { stream, data } = JSON.parse(ev.data);
          const sym = symMap[stream.replace("@miniTicker", "")];
          if (!sym) return;
          const price = parseFloat(data.c), open = parseFloat(data.o);
          const change24h = ((price - open) / open) * 100;
          setPrices(prev => prev.map(p => {
            if (p.sym !== sym) return p;
            const changed = p.price > 0 && price !== p.price;
            return { ...p, price, change24h, dir: changed ? (price > p.price ? "up" : "down") : p.dir, flashKey: changed ? p.flashKey + 1 : p.flashKey };
          }));
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (dead) return; failCount++;
        if (Date.now() - at < 3000 && failCount >= 2) { fetchRest(); return; }
        setTimeout(connect, Math.min(failCount * 2000, 10_000));
      };
      ws.onerror = () => ws?.close();
    }
    connect(); fetchRest();
    const poll = setInterval(() => { if (srcRef.current !== "ws") fetchRest(); }, 30_000);
    return () => { dead = true; clearInterval(poll); ws?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prices, source };
}

// ── Animated price ────────────────────────────────────────────────────────────
function AnimNavPrice({ price }: { price: number }) {
  const [disp, setDisp] = useState(price);
  const prev = useRef(price); const raf = useRef(0);
  useEffect(() => {
    if (price === prev.current) return;
    const from = prev.current, to = price; prev.current = to;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const pct = Math.min((now - t0) / 250, 1);
      setDisp(from + (to - from) * (1 - (1 - pct) ** 3));
      if (pct < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [price]);
  const v = disp;
  if (v >= 10_000) return <>${(v / 1000).toFixed(1)}K</>;
  if (v >= 1_000)  return <>${v.toFixed(2)}</>;
  if (v >= 1)      return <>${v.toFixed(3)}</>;
  return               <>${v.toFixed(4)}</>;
}

// ── Single pill ───────────────────────────────────────────────────────────────
function TickerPill({ sym, price, change24h, dir }: NavPrice) {
  const up = dir === "up", dn = dir === "down";
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1 rounded-full border shrink-0 transition-colors duration-500",
      up ? "border-emerald-500/30 bg-emerald-500/8"
        : dn ? "border-red-500/30 bg-red-500/8"
        : "border-white/8 bg-white/4"
    )}>
      <span className="text-[10px] font-bold text-white/50 font-mono">{sym}</span>
      <span className={cn("text-[11px] font-black font-mono",
        up ? "text-emerald-400" : dn ? "text-red-400" : "text-foreground")}>
        {price > 0 ? <AnimNavPrice price={price} /> : <span className="text-white/20">–</span>}
      </span>
      {price > 0 && (
        <span className={cn("flex items-center gap-0.5 text-[10px] font-semibold",
          change24h >= 0 ? "text-emerald-400" : "text-red-400")}>
          {change24h >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
          {Math.abs(change24h).toFixed(2)}%
        </span>
      )}
    </div>
  );
}

// ── AppHeader ─────────────────────────────────────────────────────────────────
const ROUTE_TITLE_KEYS: Record<string, string> = {
  "/market": "routes./market.title",
  "/ai-hub": "routes./ai-hub.title",
  "/copytrade": "routes./copytrade.title",
  "/strategy": "routes./strategy.title",
  "/projects": "routes./projects.title",
  "/tools": "sidebar.tools",
  "/notifications": "routes./notifications.title",
  "/settings": "routes./settings.title",
};

export function AppHeader() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen } = useSidebarContext();
  const { data: profile, isLoading: isLoadingProfile } = useGetUserProfile();
  const { prices, source } = useHeaderPrices();

  const loaded = prices.some(p => p.price > 0);
  const pageTitleKey = ROUTE_TITLE_KEYS[location.split("/").slice(0, 2).join("/") || location] ?? "routes./market.title";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 safe-area-pt">

      {/* Row 1 — pill ticker (hidden on xs, compact on sm) */}
      <div className="bg-white/[0.02] h-8 sm:h-9 hidden sm:flex items-center gap-0 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 shrink-0 border-r border-white/8 h-full">
          <span className={cn("w-1.5 h-1.5 rounded-full",
            source === "ws" ? "bg-emerald-400 animate-pulse"
            : loaded ? "bg-amber-400 animate-pulse" : "bg-zinc-600")} />
          <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase">{t("header.live")}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="ticker-animate flex items-center gap-2 px-2 w-max">
            {prices.map(p => <TickerPill key={`a-${p.sym}`} {...p} />)}
            {prices.map(p => <TickerPill key={`b-${p.sym}`} {...p} />)}
          </div>
        </div>
      </div>

      {/* Row 2 — mobile title bar + controls */}
      <div className="h-12 sm:h-11 flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-3 border-t border-white/5">
        {isMobile ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Link
              href="~/portal"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0 touch-manipulation"
              aria-label={t("aiSite.backToPortal", { defaultValue: "返回门户" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold truncate leading-tight">{t(pageTitleKey)}</h1>
              <p className="text-[10px] text-muted-foreground truncate">D³-AI</p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden h-8 w-8 flex items-center justify-center rounded-md text-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            aria-label={t("header.openMenu")}
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

        {!isMobile && <div className="flex-1 min-w-0" />}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-gold/15 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-green" />
              <span className="text-muted-foreground">{t("header.sysOk")}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-gold/15 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-gold pulse-gold" />
              <span className="text-muted-foreground">{t("header.aiSync")}</span>
            </div>
          </div>
          <div className="w-px h-4 bg-border hidden sm:block" />
          <NotificationBell />
          <LanguageSwitcher />
          <div className="w-px h-4 bg-border hidden sm:block" />
          {isLoadingProfile ? (
            <Skeleton className="h-7 w-7 rounded-full" />
          ) : (
            <Avatar className="h-7 w-7 border border-primary/20 cursor-pointer hover:border-primary/50 transition-colors ring-1 ring-background">
              <AvatarImage src={profile?.avatarUrl || undefined} alt={profile?.username} />
              <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                {profile?.username?.substring(0, 2).toUpperCase() || "D3"}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>

    </header>
  );
}
