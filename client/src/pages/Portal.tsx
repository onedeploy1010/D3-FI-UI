import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Globe, Copy, Check, ArrowRight, ChevronDown, Sparkles, Handshake, Wallet as WalletIcon } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { PortalOrbitalDiagram } from '@/components/illustrations/PortalOrbitalDiagram';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader } from '@/components/layout/SitePageHeader';
// IllustrationCard no longer used — the orbital lives inside the hub card now.
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { GlassCard, GlassChip, GlassIconButton } from '@/components/ui/GlassSurface';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WalletGate } from '@/components/wallet/WalletGate';
import { ReferralShareButton } from '@/components/referral/ReferralPosterShare';
import { PrivateSaleHeartbeat } from '@/components/partner/PrivateSaleHeartbeat';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/contexts/ThemeContext';
import { captureReferralFromUrl } from '@/lib/referral';
import { isDemoWallet } from '@/lib/demoWallet';
import { buildReferralLink } from '@/lib/referral';
import { shortWallet } from '@/lib/wallet';
import { getAddress } from 'viem';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';
import { useAppLang } from '@/i18n/LanguageContext';
import { usePortalTranslation } from '@/i18n/usePortalTranslation';

const PROFILE_OPEN_KEY = 'd3_portal_profile_open';

export default function Portal() {
  const { lang } = useAppLang();
  const t = usePortalTranslation(lang);
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  // Collapsed by default so the heartbeat card gets the fold; remember the choice.
  const [profileOpen, setProfileOpen] = useState(() => {
    try {
      return localStorage.getItem(PROFILE_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleProfile = () => {
    setProfileOpen((v) => {
      try {
        localStorage.setItem(PROFILE_OPEN_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { wallet } = useWallet();
  const { epoch: protocolEpoch, isLoading: protocolLoading } = useProtocolEpoch(lang);
  // Display with EIP-55 checksum casing, like every Ethereum wallet shows it.
  const checksummedWallet = (() => {
    if (!wallet) return null;
    try {
      return getAddress(wallet);
    } catch {
      return wallet;
    }
  })();
  const referralLink = buildReferralLink(checksummedWallet ?? wallet);

  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  const handleCopy = () => {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <WalletGate>
    <div className={`min-h-screen flex flex-col antialiased transition-colors duration-300 ${isDark ? 'bg-dark-gradient text-[#F5F0EB]' : 'bg-light-gradient text-foreground'}`}>
      <SiteTopBar
        logoTo="/"
        logoSize={48}
        isDark={isDark}
        onDisconnect={() => navigate('/')}
      />

      <div className="page-px py-5 sm:py-8 max-w-md mx-auto md:max-w-2xl flex-1 w-full space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <SitePageHeader variant="content" title={t('page.welcome')} subtitle={t('page.subtitle')} className="mb-1" />
        </motion.div>

        {/* Collapsible profile: address + referral link. Collapsed by default so the
            heartbeat card sits above the fold. */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <GlassCard variant="accent" className="p-0 overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={toggleProfile}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleProfile();
                }
              }}
              aria-expanded={profileOpen}
              className="w-full flex items-center gap-3 p-4 text-left tap-press cursor-pointer"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="relative ios-glass-inset w-11 h-11 rounded-2xl flex items-center justify-center shrink-0">
                <WalletIcon size={19} className="text-[#E0568F]" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white/80 animate-pulse" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
                  {t('page.wallet')} · <span className="text-emerald-500">{t('page.status')}</span>
                </span>
                {/* Expanded shows the FULL address below — don't repeat it here. */}
                {!profileOpen && (
                  <span className={`block font-mono text-sm font-bold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {checksummedWallet ? shortWallet(checksummedWallet) : '—'}
                  </span>
                )}
              </span>
              <GlassIconButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                aria-label="Copy address"
                className="shrink-0 tap-press"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className={isDark ? 'text-white/45' : 'text-[#160510]/45'} />}
              </GlassIconButton>
              <ChevronDown
                size={18}
                className={`shrink-0 transition-transform duration-300 ${profileOpen ? 'rotate-180' : ''} ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}
                aria-hidden
              />
            </div>

            <AnimatePresence initial={false}>
              {profileOpen && (
                <motion.div
                  key="profile-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <div className="ios-glass-inset rounded-2xl px-3.5 py-3">
                      <div className={`font-mono text-[13px] font-semibold leading-relaxed break-all select-text ${isDark ? 'text-white/90' : 'text-[#160510]/90'}`}>
                        {checksummedWallet ?? '—'}
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between gap-2">
                      <div className={`text-xs font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>
                        {t('page.referralLink')}
                      </div>
                      {/* AddressBlock below has its own copy — this one shares the poster. */}
                      <ReferralShareButton
                        link={referralLink}
                        lang={lang}
                        className={`tap-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          isDark
                            ? 'bg-[#E0568F]/18 text-[#f9a8d4] border border-[#E0568F]/25'
                            : 'bg-[#E0568F]/10 text-[#8A2B57] border border-[#E0568F]/20'
                        }`}
                      >
                        {t('share.button')}
                      </ReferralShareButton>
                    </div>
                    <div className="mt-1.5">
                      <AddressBlock value={referralLink} isDark={isDark} compact />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <PrivateSaleHeartbeat lang={lang} isDark={isDark} />
        </motion.div>

        {/* Protocol hub: the three app entries on top (受贿者联盟 → AI 分析站 → 贿赂金融),
            orbital animation below. Raised rows, hover glow, pressed accent state. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <GlassCard variant="default" className="p-0 overflow-hidden">
            <div className="p-4 pb-1 space-y-3">
              {[
                {
                  key: 'partner',
                  icon: <Handshake size={19} className="text-[#E0568F]" />,
                  title: t('partner.title'),
                  desc: t('partner.desc'),
                  badge: t('partner.badge'),
                  badgeCls: 'text-emerald-500 !bg-emerald-500/10 !border-emerald-500/15',
                  onClick: () => navigate('/partner'),
                  disabled: false,
                },
                {
                  key: 'ai',
                  icon: <Sparkles size={19} className="text-[#E0568F]" />,
                  title: t('ai.title'),
                  desc: t('ai.desc'),
                  badge: t('ai.badge'),
                  badgeCls: 'text-emerald-500 !bg-emerald-500/10 !border-emerald-500/15',
                  onClick: () => navigate('/ai/market'),
                  disabled: false,
                },
                {
                  key: 'fi',
                  icon: <Globe size={19} className={isDark ? 'text-white/35' : 'text-[#160510]/30'} />,
                  title: t('fi.title'),
                  desc: t('fi.desc'),
                  badge: t('fi.badgeOffline'),
                  badgeCls: 'text-amber-500/90 !bg-amber-500/10 !border-amber-500/15',
                  onClick: () => setBuildingOpen(true),
                  disabled: true,
                },
              ].map((site, i) => (
                <motion.button
                  key={site.key}
                  type="button"
                  onClick={site.onClick}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.24 + i * 0.08 }}
                  whileTap={{ scale: 0.97, y: 1 }}
                  className={`w-full rounded-2xl p-3.5 flex items-center gap-3 text-left ${
                    site.disabled ? 'portal-site-row portal-site-row-muted' : 'portal-site-row'
                  }`}
                >
                  <span className="ios-glass-inset w-11 h-11 rounded-2xl flex items-center justify-center shrink-0">
                    {site.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[15px] font-bold tracking-tight truncate ${
                          site.disabled
                            ? isDark
                              ? 'text-white/45'
                              : 'text-[#160510]/45'
                            : isDark
                              ? 'text-white'
                              : 'text-[#160510]'
                        }`}
                      >
                        {site.title}
                      </span>
                      <GlassChip className={`!py-0.5 !px-2 text-[10px] font-semibold shrink-0 ${site.badgeCls}`}>
                        {site.badge}
                      </GlassChip>
                    </span>
                    <span
                      className={`block text-xs mt-0.5 truncate ${
                        site.disabled
                          ? isDark
                            ? 'text-white/30'
                            : 'text-[#160510]/35'
                          : isDark
                            ? 'text-white/45'
                            : 'text-[#160510]/50'
                      }`}
                    >
                      {site.desc}
                    </span>
                  </span>
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      site.disabled
                        ? isDark
                          ? 'bg-white/5 text-white/30'
                          : 'bg-[#160510]/5 text-[#160510]/30'
                        : isDark
                          ? 'bg-[#E0568F]/15 text-[#f9a8d4]'
                          : 'bg-[#E0568F]/10 text-[#8A2B57]'
                    }`}
                  >
                    <ArrowRight size={15} />
                  </span>
                </motion.button>
              ))}
            </div>

            <div className="relative px-4 pb-4">
              <PortalOrbitalDiagram lang={lang} isDark={isDark} />
              <div className={`text-xs font-semibold text-center mt-1 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                {t('page.diagramCaption')}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Protocol announcements are seeded demo numbers for the not-yet-live
            bribe market — only the demo line-leader session should see them. */}
        {isDemoWallet(wallet) && (
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="site-card-title">{t('page.announcements')}</h3>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/45'}`}>{t('page.protocolPublic')}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <GlassChip className="!py-0.5 !px-2 text-[10px] font-semibold text-amber-500/90 !bg-amber-500/10 !border-amber-500/15">
                  {t('fi.badgeOffline')}
                </GlassChip>
                <GlassChip className="!py-0.5 !px-2 text-[10px] font-semibold text-sky-400 !bg-sky-500/10 !border-sky-500/15">
                  {t('fi.badgeDemo')}
                </GlassChip>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { label: t('page.epoch'), value: protocolLoading ? '…' : (protocolEpoch?.label ?? '—') },
                { label: t('page.bribePool'), value: protocolLoading ? '…' : (protocolEpoch?.bribePoolAdded ?? '—') },
                { label: t('page.emission'), value: protocolLoading ? '…' : (protocolEpoch?.monthlyEmission ?? '—') },
                { label: t('page.countdown'), value: protocolLoading ? '…' : (protocolEpoch?.countdown ?? '—') },
              ].map((item, i) => (
                <GlassChip key={i} className="!p-2.5 sm:!p-3">
                  <div className="site-stat-label mb-1">{item.label}</div>
                  <div className="site-stat-value-sm site-stat-value-accent">{item.value}</div>
                </GlassChip>
              ))}
            </div>
          </GlassCard>
        </motion.div>
        )}
      </div>

      <SiteFooter lang={lang} variant="compact" showCta={false} />

      <Dialog open={buildingOpen} onOpenChange={setBuildingOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#E0568F]" />
              {t('fi.buildingTitle')}
            </DialogTitle>
            <DialogDescription className="pt-1">{t('fi.buildingDesc')}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
    </WalletGate>
  );
}
