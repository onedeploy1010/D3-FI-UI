import type { NotificationsBundle, UserNotificationRow, UserNotificationView } from './notificationTypes';
import { unionFetch } from './unionApi';

export function mapNotification(row: UserNotificationRow, lang: 'zh' | 'en'): UserNotificationView {
  return {
    id: row.id,
    title: lang === 'zh' ? row.title_zh : row.title_en,
    message: lang === 'zh' ? row.message_zh : row.message_en,
    category: row.category,
    linkPath: row.link_path,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function fetchNotifications(wallet: string, unreadOnly = false): Promise<NotificationsBundle> {
  const q = unreadOnly ? '?unreadOnly=true' : '';
  return unionFetch<NotificationsBundle>(`/notifications${q}`, wallet);
}

export async function markNotificationRead(wallet: string, id: string) {
  return unionFetch<{ ok: boolean; id: string }>(`/notifications/${id}/read`, wallet, { method: 'POST' });
}

export async function markAllNotificationsRead(wallet: string) {
  return unionFetch<{ ok: boolean }>('/notifications/read-all', wallet, { method: 'POST' });
}
