import { useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassIconButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import { useWallet } from '@/contexts/wallet-context';
import { useNotifications } from '@/hooks/useNotifications';

const categoryColors: Record<string, string> = {
  protocol: '#E0568F',
  dividend: '#22c55e',
  multisig: '#6366f1',
  referral: '#f59e0b',
  system: '#94a3b8',
};

function timeAgo(iso: string, lang: 'zh' | 'en') {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (hours < 24) return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'zh' ? `${days} 天前` : `${days}d ago`;
}

export function SiteNotificationBell({ lang, isDark }: { lang: 'zh' | 'en'; isDark?: boolean }) {
  const t = lang === 'zh';
  const { wallet } = useWallet();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const { items, unreadCount, isLoading, markRead, markAllRead } = useNotifications(wallet, lang);

  if (!wallet) return null;

  const dark = isDark ?? false;
  const muted = dark ? 'text-white/45' : 'text-[#160510]/45';

  return (
    <div className="relative">
      <GlassIconButton
        onClick={() => setOpen((v) => !v)}
        aria-label={t ? '通知' : 'Notifications'}
        className="relative !h-8 !w-8"
      >
        <Bell size={16} className={muted} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[#E0568F] text-[9px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </GlassIconButton>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40"
              aria-label={t ? '关闭' : 'Close'}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={cn(
                // Pin to the viewport's top-right (below the header, safe-area aware)
                // with a width clamped to the viewport. Anchoring `absolute right-0` to
                // the bell put the panel mid-bar (lang + wallet buttons follow it), so a
                // 22rem panel spilled off the left edge on mobile.
                'fixed z-50 right-4 top-[calc(env(safe-area-inset-top)+3.25rem)] w-[min(100vw-2rem,22rem)] rounded-2xl border shadow-xl overflow-hidden',
                dark ? 'bg-[#1a1018]/95 border-white/10' : 'bg-white/95 border-[#8A2B57]/10',
              )}
            >
              <div className={cn('flex items-center justify-between px-4 py-3 border-b', dark ? 'border-white/8' : 'border-[#8A2B57]/8')}>
                <div>
                  <div className={cn('text-sm font-bold', dark ? 'text-white' : 'text-[#160510]')}>
                    {t ? '通知' : 'Notifications'}
                  </div>
                  {unreadCount > 0 && (
                    <div className={cn('text-[10px] mt-0.5', muted)}>
                      {unreadCount} {t ? '条未读' : 'unread'}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className={cn('text-[10px] font-semibold px-2 py-1 rounded-lg ios-glass-pressable', muted)}
                    >
                      <Check size={12} className="inline mr-0.5" />
                      {t ? '全部已读' : 'Mark all'}
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} className={cn('p-1 rounded-lg', muted)}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {isLoading ? (
                  <div className={cn('py-10 text-center text-xs', muted)}>{t ? '加载中…' : 'Loading…'}</div>
                ) : items.length === 0 ? (
                  <div className={cn('py-10 text-center text-xs', muted)}>{t ? '暂无通知' : 'No notifications'}</div>
                ) : (
                  items.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        if (!notif.isRead) void markRead(notif.id);
                        if (notif.linkPath) {
                          navigate(notif.linkPath);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b last:border-0 ios-glass-pressable',
                        dark ? 'border-white/[0.06]' : 'border-[#8A2B57]/[0.06]',
                        !notif.isRead && (dark ? 'bg-[#E0568F]/[0.06]' : 'bg-[#E0568F]/[0.04]'),
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: categoryColors[notif.category] ?? categoryColors.system }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn('text-xs font-semibold truncate', dark ? 'text-white' : 'text-[#160510]')}>
                              {notif.title}
                            </span>
                            {!notif.isRead && (
                              <span className="text-[9px] font-bold text-[#E0568F] shrink-0">NEW</span>
                            )}
                          </div>
                          <p className={cn('text-[11px] mt-0.5 leading-relaxed line-clamp-2', muted)}>{notif.message}</p>
                          <div className={cn('text-[9px] mt-1.5', dark ? 'text-white/30' : 'text-[#160510]/30')}>
                            {timeAgo(notif.createdAt, lang)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
