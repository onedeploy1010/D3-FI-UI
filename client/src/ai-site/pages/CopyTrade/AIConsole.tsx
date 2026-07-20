import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@ai/lib/utils";
import { Send, Bot, Terminal, MessageSquare, Zap, TrendingUp, TrendingDown, Shield, Flame, ChevronRight } from "lucide-react";
import { apiHeaders } from "@ai/api-client-react";
import { aiFetch } from "@/lib/aiApi";
import type { AIAgent, Signal } from "./types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const STARTER_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content: "Hello! I'm your AI trading agent. I can help you analyze trader signals, research strategies, generate trade advice, and optimize your portfolio. What would you like to explore?",
    timestamp: new Date().toISOString(),
  },
];

// ── Animated typing dots ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary"
          animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────
function ChatMsg({ msg }: { msg: ChatMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: msg.role === "user" ? 24 : -24, y: 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ type: "spring", damping: 26, stiffness: 280 }}
      className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
    >
      {msg.role === "assistant" && (
        <motion.div
          className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mr-2 mt-0.5 shrink-0"
          animate={{ boxShadow: ["0 0 0px rgba(59,130,246,0.3)", "0 0 12px rgba(59,130,246,0.4)", "0 0 0px rgba(59,130,246,0.3)"] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <Bot className="h-3.5 w-3.5 text-primary" />
        </motion.div>
      )}
      <div className={cn(
        "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
        msg.role === "user"
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-white/5 border border-white/8 rounded-bl-sm backdrop-blur-sm"
      )}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <div className={cn("text-[9px] mt-1 font-mono", msg.role === "user" ? "text-primary-foreground/50 text-right" : "text-muted-foreground")}>
          {new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </motion.div>
  );
}

// ── Signal terminal ───────────────────────────────────────────────────────────
function SignalRow({ sig, i }: { sig: Signal; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.06, type: "spring", damping: 22 }}
      className={cn(
        "flex items-start gap-2 p-2.5 rounded-xl border transition-all hover:brightness-110",
        sig.status === "active"
          ? "border-primary/25 bg-primary/5 hover:bg-primary/8"
          : sig.status === "filled"
          ? "border-border/30 bg-white/3"
          : "border-border/15 opacity-40"
      )}
    >
      {/* Direction badge */}
      <motion.div
        animate={sig.status === "active" ? { opacity: [1, 0.6, 1] } : {}}
        transition={{ duration: 1.4, repeat: Infinity }}
        className={cn(
          "shrink-0 w-10 rounded-md text-[9px] font-black flex flex-col items-center justify-center py-1 gap-0.5 mt-0.5",
          sig.direction === "LONG" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
        )}
      >
        {sig.direction === "LONG" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span>{sig.direction}</span>
      </motion.div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5 font-mono">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[12px] font-bold text-foreground">{sig.symbol}</span>
          <span className="text-[9px] text-muted-foreground shrink-0">
            {new Date(sig.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", sig.confidence >= 7.5 ? "bg-emerald-500" : sig.confidence >= 6 ? "bg-amber-400" : "bg-red-500")}
              initial={{ width: 0 }}
              animate={{ width: `${sig.confidence * 10}%` }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
            />
          </div>
          <span className={cn("text-[9px] font-bold shrink-0",
            sig.confidence >= 7.5 ? "text-emerald-400" : sig.confidence >= 6 ? "text-amber-400" : "text-red-400"
          )}>
            AI {sig.confidence.toFixed(1)}
          </span>
        </div>

        <div className="text-[10px] text-muted-foreground leading-tight truncate">{sig.reason}</div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/70">via {sig.source}</span>
          {sig.pnl != null && (
            <span className={cn("text-[9px] font-bold", sig.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
              {sig.pnl >= 0 ? "+" : ""}${Math.abs(sig.pnl).toFixed(0)}
            </span>
          )}
          <span className={cn("ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded",
            sig.status === "active" ? "bg-blue-500/15 text-blue-400" :
            sig.status === "filled" ? "bg-emerald-500/10 text-emerald-400" :
            "bg-muted text-muted-foreground"
          )}>
            {sig.status.toUpperCase()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function AIConsole() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>(STARTER_MESSAGES);
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState("balanced-pro");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: agents = [] } = useQuery<AIAgent[]>({
    queryKey: ["ai-agents"],
    queryFn: () => aiFetch<AIAgent[]>("/copytrade/ai-agents", { headers: apiHeaders() }),
    staleTime: 60000,
  });

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["copytrade-signals"],
    queryFn: () => aiFetch<Signal[]>("/copytrade/signals", { headers: apiHeaders() }),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: (msg: string) =>
      aiFetch<ChatMessage>("/copytrade/ai-chat", {
        method: "POST",
        headers: apiHeaders(),
        body: { message: msg, agentId },
      }),
    onSuccess: (reply) => setMessages(prev => [...prev, reply]),
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || isPending) return;
    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    sendMessage(text);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const selectedAgent = (agents as AIAgent[]).find(a => a.id === agentId);
  const riskColor = selectedAgent?.riskLevel === "low" ? "text-emerald-400" : selectedAgent?.riskLevel === "medium" ? "text-amber-400" : "text-red-400";

  const QUICK_PROMPTS = [
    "Analyze top trader strategy",
    "Best signals today?",
    "Optimize my position size",
    "BTC risk assessment",
    "Which agent for volatile markets?",
  ];

  const activeSignals = (signals as Signal[]).filter(s => s.status === "active");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:h-[calc(100vh-280px)] xl:min-h-[640px]"
    >
      {/* ── Chat panel ──────────────────────────────────────────── */}
      <div className="xl:col-span-2 rounded-2xl border border-border/50 bg-card/60 flex flex-col overflow-hidden backdrop-blur-sm h-[520px] sm:h-[620px] xl:h-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/20 bg-gradient-to-r from-primary/5 to-purple-500/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <MessageSquare className="h-4 w-4 text-primary" />
            </motion.div>
            <span className="text-sm font-bold">{t("copyTrade.aiStrategyConsole")}</span>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{t("copyTrade.agentLabel")}:</span>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-7 w-44 text-xs border-primary/20 bg-primary/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(agents as AIAgent[]).map(a => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      {a.riskLevel === "low" ? <Shield className="h-3 w-3 text-emerald-400" /> :
                       a.riskLevel === "medium" ? <Zap className="h-3 w-3 text-amber-400" /> :
                       <Flame className="h-3 w-3 text-red-400" />}
                      {a.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Agent info bar */}
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="px-4 py-2 border-b border-border/10 bg-primary/3 flex items-center gap-4 text-[10px] shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("font-bold", riskColor)}>{selectedAgent.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{selectedAgent.style}</span>
            </div>
            <div className="ml-auto flex gap-3 font-mono">
              <span>WR <span className="text-emerald-400 font-bold">{selectedAgent.winRate}%</span></span>
              <span>ROI <span className="text-primary font-bold">+{selectedAgent.avgRoi}%</span></span>
              <span>MaxDD <span className="text-red-400 font-bold">{selectedAgent.maxDrawdown}%</span></span>
            </div>
          </motion.div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => <ChatMsg key={i} msg={msg} />)}
          </AnimatePresence>

          {isPending && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-start"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-white/5 border border-white/8 rounded-2xl rounded-bl-sm px-4 py-2.5">
                <TypingDots />
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        <div className="px-4 py-2 border-t border-border/10 flex gap-1.5 overflow-x-auto shrink-0">
          {QUICK_PROMPTS.map(p => (
            <motion.button
              key={p}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1 text-[10px] bg-white/5 hover:bg-primary/10 border border-border/40 hover:border-primary/30 rounded-full px-2.5 py-1 whitespace-nowrap text-muted-foreground hover:text-primary transition-all shrink-0"
              onClick={() => setInput(p)}
            >
              <ChevronRight className="h-2.5 w-2.5" /> {p}
            </motion.button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border/20 flex gap-2 shrink-0">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={t("copyTrade.askPlaceholder")}
            className="text-sm bg-white/4 border-border/30 focus:border-primary/40"
            disabled={isPending}
          />
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="relative overflow-hidden"
            >
              <Send className="h-4 w-4 relative z-10" />
              <span className="absolute inset-0 shimmer-bg opacity-0 hover:opacity-100 transition-opacity" />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ── Signal terminal ────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 overflow-hidden flex flex-col terminal-grid bg-[hsl(222,25%,5%)] h-[440px] sm:h-[500px] xl:h-auto">
        {/* Terminal header */}
        <div className="px-4 py-2.5 border-b border-border/20 flex items-center gap-2 bg-black/30 shrink-0">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-pulse" />
          </div>
          <Terminal className="h-3.5 w-3.5 text-primary ml-1" />
          <span className="text-[11px] font-mono font-bold text-primary tracking-widest uppercase">{t("copyTrade.signalFeed")}</span>
          <div className="ml-auto flex items-center gap-2 text-[9px] font-mono">
            <span className="text-emerald-400 font-bold">{activeSignals.length} LIVE</span>
            <span className="cursor-blink text-primary">█</span>
          </div>
        </div>

        {/* Live ticker */}
        {activeSignals.length > 0 && (
          <div className="px-3 py-1.5 bg-emerald-500/5 border-b border-emerald-500/15 flex items-center gap-2 shrink-0">
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-[9px] font-mono text-emerald-400 font-bold"
            >
              ● {t("copyTrade.activeSignals")}:
            </motion.span>
            <span className="text-[9px] font-mono text-emerald-300 truncate">
              {activeSignals.map(s => `${s.symbol} ${s.direction}`).join(" · ")}
            </span>
          </div>
        )}

        {/* Signal list */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          <AnimatePresence>
            {(signals as Signal[]).map((sig, i) => (
              <SignalRow key={sig.id} sig={sig} i={i} />
            ))}
          </AnimatePresence>
        </div>

        {/* Footer stats */}
        <div className="px-3 py-2 border-t border-border/20 bg-black/20 shrink-0">
          <div className="grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
            <div>
              <div className="text-muted-foreground">{t("copyTrade.total")}</div>
              <div className="text-foreground font-bold">{(signals as Signal[]).length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("copyTrade.filled")}</div>
              <div className="text-emerald-400 font-bold">{(signals as Signal[]).filter(s => s.status === "filled").length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("copyTrade.activeLabel")}</div>
              <div className="text-blue-400 font-bold animate-pulse">{activeSignals.length}</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
