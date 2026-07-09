import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetNotifications, useMarkNotificationRead } from "@ai/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check } from "lucide-react";
import { formatDateTime } from "@ai/lib/format";
import { cn } from "@ai/lib/utils";
import { useToast } from "@ai/hooks/use-toast";

type NotifType = "all" | "trade" | "ai" | "alert" | "system";

function typeDot(type: string) {
  switch (type) {
    case "trade": return "bg-blue-500";
    case "ai": return "bg-primary";
    case "alert": return "bg-destructive";
    default: return "bg-muted-foreground";
  }
}

export default function Notifications() {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState<NotifType>("all");
  const { data: notifications, isLoading, refetch } = useGetNotifications({});
  const markRead = useMarkNotificationRead();
  const { toast } = useToast();

  const filtered = notifications?.filter(n =>
    typeFilter === "all" ? true : n.type === typeFilter
  );

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => refetch(),
    });
  };

  const handleMarkAllRead = () => {
    const unread = notifications?.filter(n => !n.isRead) ?? [];
    if (unread.length === 0) return;
    let completed = 0;
    unread.forEach(n => {
      markRead.mutate({ id: n.id }, {
        onSuccess: () => {
          completed++;
          if (completed === unread.length) {
            refetch();
            toast({ title: `${unread.length} notification${unread.length > 1 ? "s" : ""} marked as read` });
          }
        },
      });
    });
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight gradient-text-gold font-display flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            {t("notifications.title")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("notifications.subtitle")}</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markRead.isPending}
            className="shrink-0"
          >
            <Check className="w-4 h-4 mr-2" />
            {t("notifications.markAllRead")} ({unreadCount})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as NotifType)}>
          <TabsList>
            <TabsTrigger value="all">{t("notifications.all")}</TabsTrigger>
            <TabsTrigger value="trade">{t("notifications.trade")}</TabsTrigger>
            <TabsTrigger value="ai">{t("notifications.ai")}</TabsTrigger>
            <TabsTrigger value="alert">{t("notifications.alert")}</TabsTrigger>
            <TabsTrigger value="system">{t("notifications.system")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border/20">
              {filtered.map(notif => (
                <div
                  key={notif.id}
                  className={cn(
                    "group p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors cursor-pointer",
                    !notif.isRead && "bg-primary/5"
                  )}
                  onClick={() => !notif.isRead && handleMarkRead(notif.id)}
                >
                  <div className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", typeDot(notif.type))} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{notif.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {!notif.isRead && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 py-0 h-4">NEW</Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] capitalize py-0 h-4">{notif.type}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground font-mono">{formatDateTime(notif.createdAt)}</span>
                      {notif.symbol && (
                        <span className="text-[10px] font-mono bg-muted px-1.5 rounded">{notif.symbol}</span>
                      )}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Bell className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">{t("notifications.noNotifications")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
