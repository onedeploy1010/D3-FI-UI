import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings2, Bell, Plus, Trash2, AlertCircle, MessageSquare, Send, CheckCircle2, Zap, Radio, Mail, Bot } from "lucide-react";
import { cn } from "@ai/lib/utils";
import { useToast } from "@ai/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type Tab = "general" | "notifications" | "channels";

function GeneralTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.platformPreferences")}</CardTitle>
          <CardDescription>{t("settings.customizeExperience")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings.advancedTradingView")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.advancedTradingViewDesc")}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="h-px w-full bg-border/50" />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings.aiAudioAlerts")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.aiAudioAlertsDesc")}</p>
              </div>
              <Switch />
            </div>
            <div className="h-px w-full bg-border/50" />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t("settings.autoApproveLowRisk")}</Label>
                <p className="text-sm text-muted-foreground">{t("settings.autoApproveLowRiskDesc")}</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.displaySettings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="currency">{t("settings.baseCurrency")}</Label>
            <Input id="currency" defaultValue="USD" className="max-w-xs font-mono" disabled />
            <p className="text-xs text-muted-foreground">{t("settings.contactSupport")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">{t("settings.timezone")}</Label>
            <Input id="timezone" defaultValue="UTC (Auto-detected)" className="max-w-xs" disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const { t } = useTranslation();
  const [tradeAlerts, setTradeAlerts] = useState(true);
  const [aiSignals, setAiSignals] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [systemAlerts, setSystemAlerts] = useState(true);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">{t("settings.notificationPreferences")}</CardTitle>
        <CardDescription>{t("settings.chooseNotifications")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.tradeAlerts")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.tradeAlertsDesc")}</p>
            </div>
            <Switch checked={tradeAlerts} onCheckedChange={setTradeAlerts} />
          </div>
          <div className="h-px w-full bg-border/50" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.aiSignals")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.aiSignalsDesc")}</p>
            </div>
            <Switch checked={aiSignals} onCheckedChange={setAiSignals} />
          </div>
          <div className="h-px w-full bg-border/50" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.priceAlerts")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.priceAlertsDesc")}</p>
            </div>
            <Switch checked={priceAlerts} onCheckedChange={setPriceAlerts} />
          </div>
          <div className="h-px w-full bg-border/50" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.systemAlerts")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.systemAlertsDesc")}</p>
            </div>
            <Switch checked={systemAlerts} onCheckedChange={setSystemAlerts} />
          </div>
          <div className="h-px w-full bg-border/50" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">{t("settings.emailDigest")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings.emailDigestDesc")}</p>
            </div>
            <Switch checked={emailDigest} onCheckedChange={setEmailDigest} />
          </div>
        </div>
        <div className="pt-2">
          <Button size="sm">{t("settings.savePreferences")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Channels tab ──────────────────────────────────────────────────────────────
type Channel = { id: number; name: string; type: string; config: any; enabled: boolean; events: string[]; lastTestedAt: string | null; createdAt: string };

const PLATFORM_CFG: Record<string, { label: string; icon: React.ReactNode; color: string; border: string; badge: string; fields: { key: string; label: string; placeholder: string; type?: string }[]; comingSoon?: boolean }> = {
  telegram: {
    label: "Telegram", icon: <Send className="h-5 w-5" />, color: "text-blue-400", border: "border-blue-500/25", badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    fields: [
      { key: "token", label: "Bot Token", placeholder: "123456789:AAFxxxx...", type: "password" },
      { key: "chatId", label: "Chat ID", placeholder: "-100123456789 or @channel" },
    ],
  },
  discord: {
    label: "Discord", icon: <MessageSquare className="h-5 w-5" />, color: "text-violet-400", border: "border-violet-500/25", badge: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/..." },
    ],
  },
  whatsapp: {
    label: "WhatsApp", icon: <Radio className="h-5 w-5" />, color: "text-emerald-400", border: "border-emerald-500/25", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    fields: [{ key: "phone", label: "Phone Number", placeholder: "+1234567890" }],
    comingSoon: true,
  },
  email: {
    label: "Email", icon: <Mail className="h-5 w-5" />, color: "text-amber-400", border: "border-amber-500/25", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    fields: [{ key: "address", label: "Email Address", placeholder: "you@example.com" }],
    comingSoon: true,
  },
};

const EVENT_OPTS = [
  { key: "trade",   label: "Trade Execution", icon: <Zap className="h-3 w-3" /> },
  { key: "signal",  label: "AI Signal",        icon: <Bot className="h-3 w-3" /> },
  { key: "alert",   label: "Risk Alert",       icon: <AlertCircle className="h-3 w-3" /> },
  { key: "sync",    label: "Sync Update",      icon: <Radio className="h-3 w-3" /> },
  { key: "summary", label: "Daily Summary",    icon: <CheckCircle2 className="h-3 w-3" /> },
];

function ChannelsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<string>("telegram");
  const [addName, setAddName] = useState("");
  const [addConfig, setAddConfig] = useState<Record<string, string>>({});
  const [addEvents, setAddEvents] = useState<string[]>(["trade", "signal", "alert"]);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const reload = async () => {
    try { const r = await fetch("/api/notifications/channels"); setChannels(await r.json()); } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await fetch("/api/notifications/channels", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName, type: addType, config: addConfig, events: addEvents }) });
      if (!r.ok) throw new Error("Failed");
      toast({ title: t("settings.channelAdded"), description: `${PLATFORM_CFG[addType]?.label} connected.` });
      setAddOpen(false); setAddName(""); setAddConfig({}); setAddEvents(["trade","signal","alert"]);
      reload();
    } catch { toast({ title: "Error", description: "Could not add channel.", variant: "destructive" }); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/notifications/channels/${id}`, { method: "DELETE" });
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const r = await fetch(`/api/notifications/channels/${id}/test`, { method: "POST" });
      const d = await r.json();
      if (d.ok) toast({ title: t("settings.testSent"), description: t("settings.checkChannel") });
      else toast({ title: t("settings.testFailed"), description: d.error, variant: "destructive" });
    } catch { toast({ title: "Error", description: "Could not send test.", variant: "destructive" }); }
    setTestingId(null);
  };

  const handleToggle = async (ch: Channel) => {
    await fetch(`/api/notifications/channels/${ch.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !ch.enabled }) });
    setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, enabled: !c.enabled } : c));
  };

  const cfg = PLATFORM_CFG[addType];

  return (
    <div className="space-y-6">
      {/* Platform overview */}
      <div>
        <h3 className="text-base font-bold mb-1">{t("settings.notificationChannels")}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t("settings.connectMessaging")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Object.entries(PLATFORM_CFG).map(([type, p]) => {
            const connected = channels.filter(c => c.type === type && c.enabled).length;
            return (
              <button key={type} onClick={() => !p.comingSoon && (setAddType(type), setAddOpen(true))}
                disabled={!!p.comingSoon}
                className={cn("rounded-xl border p-3 text-left transition-all", p.border,
                  p.comingSoon ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5 cursor-pointer")}>
                <div className={cn("mb-2", p.color)}>{p.icon}</div>
                <div className="text-sm font-bold text-foreground">{p.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {p.comingSoon ? t("settings.comingSoon") : connected > 0 ? `${connected} ${t("settings.connected")}` : t("settings.notConnected")}
                </div>
                {connected > 0 && !p.comingSoon && (
                  <div className={cn("flex items-center gap-1 mt-1.5 text-[9px] font-bold", p.color)}>
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Connected channels list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">{t("settings.activeChannels")}</h4>
          <Button size="sm" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("settings.addChannel")}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 rounded-xl bg-white/4 animate-pulse" />)}</div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground/50 border border-dashed border-white/10 rounded-xl">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">{t("settings.noChannelsYet")}</p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Connect First Channel
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {channels.map(ch => {
              const p = PLATFORM_CFG[ch.type];
              return (
                <div key={ch.id} className={cn("rounded-xl border p-4", p?.border ?? "border-white/8")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center", p?.border, p?.color ?? "text-foreground")}>{p?.icon}</div>
                      <div>
                        <div className="text-sm font-bold">{ch.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{ch.type} · {ch.events?.join(", ")}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={ch.enabled} onCheckedChange={() => handleToggle(ch)} />
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" disabled={testingId === ch.id}
                        onClick={() => handleTest(ch.id)}>
                        {testingId === ch.id ? <span className="animate-spin">↻</span> : <><Send className="h-3 w-3 mr-1" />{t("settings.sendTest")}</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                        onClick={() => handleDelete(ch.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {ch.lastTestedAt && (
                    <div className="mt-2 text-[10px] text-muted-foreground/50 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      Last tested: {new Date(ch.lastTestedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add channel dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {cfg?.icon && <span className={cfg.color}>{cfg.icon}</span>}
              Connect {cfg?.label ?? "Channel"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            {/* Platform selector */}
            <div>
              <Label className="text-xs">Platform</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {["telegram", "discord"].map(t => {
                  const p2 = PLATFORM_CFG[t];
                  return (
                    <button key={t} type="button" onClick={() => { setAddType(t); setAddConfig({}); }}
                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all", p2.border,
                        addType === t ? cn(p2.badge) : "border-white/10 text-muted-foreground hover:border-white/20")}>
                      <span className={addType === t ? p2.color : ""}>{p2.icon}</span> {p2.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Channel Name</Label>
              <Input placeholder="My Telegram Alerts" value={addName} onChange={e => setAddName(e.target.value)} required />
            </div>

            {cfg?.fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input placeholder={f.placeholder} type={f.type ?? "text"} value={addConfig[f.key] ?? ""}
                  onChange={e => setAddConfig(prev => ({ ...prev, [f.key]: e.target.value }))} required />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label className="text-xs">Notify on Events</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTS.map(ev => (
                  <button key={ev.key} type="button"
                    onClick={() => setAddEvents(prev => prev.includes(ev.key) ? prev.filter(e => e !== ev.key) : [...prev, ev.key])}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all",
                      addEvents.includes(ev.key) ? "bg-primary/15 border-primary/30 text-primary" : "border-white/10 text-muted-foreground hover:border-white/20")}>
                    {ev.icon} {ev.label}
                  </button>
                ))}
              </div>
            </div>

            {addType === "telegram" && (
              <div className="text-[10px] text-muted-foreground/60 bg-blue-500/5 border border-blue-500/15 rounded-lg p-3 leading-relaxed">
                <strong className="text-blue-400">How to get your Telegram Bot Token:</strong><br />
                1. Open @BotFather in Telegram<br />
                2. Send /newbot and follow the steps<br />
                3. Copy the token (looks like 123456789:AAFxx…)<br />
                4. Get your Chat ID by sending a message to @userinfobot
              </div>
            )}

            {addType === "discord" && (
              <div className="text-[10px] text-muted-foreground/60 bg-violet-500/5 border border-violet-500/15 rounded-lg p-3 leading-relaxed">
                <strong className="text-violet-400">How to get your Discord Webhook URL:</strong><br />
                1. Go to your Discord channel settings<br />
                2. Integrations → Webhooks → New Webhook<br />
                3. Copy the Webhook URL
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={saving}>{saving ? t("common.loading") : t("settings.addChannel")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useTabs() {
  const { t } = useTranslation();
  return [
    { id: "general" as Tab, label: t("settings.general"), icon: Settings2 },
    { id: "notifications" as Tab, label: t("settings.notificationsTab"), icon: Bell },
    { id: "channels" as Tab, label: t("settings.channels"), icon: MessageSquare },
  ];
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const { t } = useTranslation();
  const tabs = useTabs();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display">{t("settings.title")}</h2>
        <p className="text-muted-foreground text-sm">{t("settings.customizeExperience")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-1 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  !isActive && "text-muted-foreground"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <div className="md:col-span-3 space-y-6">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "channels" && <ChannelsTab />}
        </div>
      </div>
    </div>
  );
}
