import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check } from "lucide-react";
import { useLocation } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGetNotifications, useMarkNotificationRead } from "@ai/api-client-react";
import { formatDateTime } from "@ai/lib/format";
import { cn } from "@ai/lib/utils";
import { useToast } from "@ai/hooks/use-toast";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { data: notifications, isLoading, refetch } = useGetNotifications({ unreadOnly: true });
  const markRead = useMarkNotificationRead();
  const { toast } = useToast();

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
            toast({ title: t("notificationBell.allMarkedRead") });
          }
        },
      });
    });
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 shadow-lg shadow-black/20 border-border/60 backdrop-blur-xl bg-card/95">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h4 className="text-sm font-medium tracking-tight">{t("notificationBell.systemAlerts")}</h4>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllRead}
                disabled={markRead.isPending}
              >
                <Check className="w-3 h-3 mr-1" /> {t("notificationBell.markAllRead")}
              </Button>
            )}
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono font-medium">
              {unreadCount} {t("notificationBell.new")}
            </span>
          </div>
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground font-mono">
              {t("notificationBell.loadingAlerts")}
            </div>
          ) : notifications && notifications.length > 0 ? (
            <div className="flex flex-col">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-4 border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer",
                    !notif.isRead ? "bg-primary/5" : ""
                  )}
                  onClick={() => handleMarkRead(notif.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 w-2 h-2 rounded-full shrink-0",
                      notif.type === "trade" ? "bg-blue-500" :
                      notif.type === "ai" ? "bg-primary" :
                      notif.type === "alert" ? "bg-destructive" :
                      "bg-muted-foreground"
                    )} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none tracking-tight">{notif.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{notif.message}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {formatDateTime(notif.createdAt)}
                        </span>
                        {notif.symbol && (
                          <span className="text-[10px] font-mono bg-muted px-1 rounded text-muted-foreground">
                            {notif.symbol}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Bell className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <p className="font-mono">{t("notificationBell.noAlerts")}</p>
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border/50 p-2">
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground h-8"
            onClick={() => { setOpen(false); navigate("/notifications"); }}
          >
            {t("notificationBell.viewAll")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
