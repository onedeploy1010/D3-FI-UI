export type UserNotificationRow = {
  id: string;
  wallet_address: string;
  title_zh: string;
  title_en: string;
  message_zh: string;
  message_en: string;
  category: 'protocol' | 'dividend' | 'multisig' | 'referral' | 'system';
  link_path: string | null;
  is_read: boolean;
  created_at: string;
};

export type UserNotificationView = {
  id: string;
  title: string;
  message: string;
  category: UserNotificationRow['category'];
  linkPath: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsBundle = {
  notifications: UserNotificationRow[];
  migrated: boolean;
};
