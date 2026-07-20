import type { NotificationsBundle, UserNotificationRow, UserNotificationView } from './notificationTypes';
import { unionFetch } from './unionApi';

export function mapNotification(row: UserNotificationRow, lang: string): UserNotificationView {
  // The backend renders templated rows into BOTH zh/en columns in the requested
  // language, so any zh* language reads title_zh, everything else title_en.
  const isZh = String(lang).startsWith('zh');
  return {
    id: row.id,
    title: isZh ? row.title_zh : row.title_en,
    message: isZh ? row.message_zh : row.message_en,
    category: row.category,
    linkPath: row.link_path,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function fetchNotifications(
  wallet: string,
  unreadOnly = false,
  lang = 'zh-CN',
): Promise<NotificationsBundle> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unreadOnly', 'true');
  params.set('lang', lang);
  return unionFetch<NotificationsBundle>(`/notifications?${params.toString()}`, wallet);
}

export async function markNotificationRead(wallet: string, id: string) {
  return unionFetch<{ ok: boolean; id: string }>(`/notifications/${id}/read`, wallet, { method: 'POST' });
}

export async function markAllNotificationsRead(wallet: string) {
  return unionFetch<{ ok: boolean }>('/notifications/read-all', wallet, { method: 'POST' });
}
