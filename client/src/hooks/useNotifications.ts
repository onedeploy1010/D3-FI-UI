import { useCallback, useEffect, useState } from 'react';
import { fetchNotifications, mapNotification, markAllNotificationsRead, markNotificationRead } from '@/lib/notificationApi';
import type { UserNotificationView } from '@/lib/notificationTypes';

export function useNotifications(wallet: string | null, lang: string = 'zh-CN') {
  const [items, setItems] = useState<UserNotificationView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [migrated, setMigrated] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!wallet) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications(wallet, false, lang);
      setMigrated(data.migrated);
      setItems(data.notifications.map((row) => mapNotification(row, lang)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [wallet, lang]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const markRead = useCallback(
    async (id: string) => {
      if (!wallet) return;
      await markNotificationRead(wallet, id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    },
    [wallet],
  );

  const markAllRead = useCallback(async () => {
    if (!wallet) return;
    await markAllNotificationsRead(wallet);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [wallet]);

  return { items, unreadCount, isLoading, migrated, error, refetch, markRead, markAllRead };
}
