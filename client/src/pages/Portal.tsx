import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Globe, Copy, Check, ArrowRight, Sparkles, Handshake } from 'lucide-react';
import { AddressBlock } from '@/components/ui/AddressBlock';
import { PortalOrbitalDiagram } from '@/components/illustrations/PortalOrbitalDiagram';
import { IllustrationCard } from '@/components/layout/IllustrationCard';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SitePageHeader } from '@/components/layout/SitePageHeader';
import { SiteTopBar } from '@/components/layout/SiteTopBar';
import { GlassCard, GlassChip, GlassIconButton } from '@/components/ui/GlassSurface';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WalletGate } from '@/components/wallet/WalletGate';
import { PrivateSaleHeartbeat } from '@/components/partner/PrivateSaleHeartbeat';
import { useWallet } from '@/contexts/wallet-context';
import { useTheme } from '@/contexts/ThemeContext';
import { captureReferralFromUrl } from '@/lib/referral';
import { isDemoWallet } from '@/lib/demoWallet';
import { buildReferralLink } from '@/lib/referral';
import { useProtocolEpoch } from '@/hooks/useProtocolEpoch';
import { useAppLang } from '@/i18n/LanguageContext';
import { usePortalTranslation } from '@/i18n/usePortalTranslation';

export default function Portal() {
  const { lang } = useAppLang();
  const t = usePortalTranslation(lang);
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { wallet } = useWallet();
  const { epoch: protocolEpoch, isLoading: protocolLoading } = useProtocolEpoch(lang);
  const referralLink = buildReferralLink(wallet);

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

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <GlassCard variant="accent" className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t('page.wallet')}</div>
              <GlassChip className="!py-1 !px-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-medium">{t('page.status')}</span>
              </GlassChip>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`font-mono text-[9px] sm:text-[10px] leading-none tracking-tight min-w-0 flex-1 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] ${
                  isDark ? 'text-white' : 'text-[#160510]'
                }`}
                title={wallet ?? undefined}
              >
                {wallet ?? '—'}
              </div>
              <GlassIconButton onClick={handleCopy} aria-label="Copy address" className="shrink-0">
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />}
              </GlassIconButton>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className={`text-[10px] font-medium mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                {t('page.referralLink')}
              </div>
              <AddressBlock value={referralLink} isDark={isDark} compact />
              <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-white/35' : 'text-[#160510]/45'}`}>
                {t('page.referralHint')}
              </p>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <PrivateSaleHeartbeat lang={lang} isDark={isDark} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
        >
          <IllustrationCard isDark={isDark} caption={t('page.diagramCaption')} className="min-h-[240px] sm:min-h-[280px] md:aspect-[4/3]">
            <PortalOrbitalDiagram lang={lang} isDark={isDark} />
          </IllustrationCard>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard variant="default" onClick={() => navigate('/ai/market')} className="p-5 h-full group cursor-pointer">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Sparkles size={18} className="text-[#E0568F]" />
                  </div>
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
                    {t('ai.badge')}
                  </GlassChip>
                </div>
                <h3 className="site-card-title mb-1">{t('ai.title')}</h3>
                <p className={`text-xs mb-4 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t('ai.desc')}</p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t('ai.cta')} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
            <GlassCard variant="default" onClick={() => navigate('/partner')} className="p-5 h-full group cursor-pointer">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Handshake size={18} className="text-[#E0568F]" />
                  </div>
                  <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/15">
                    {t('partner.badge')}
                  </GlassChip>
                </div>
                <h3 className="site-card-title mb-1">{t('partner.title')}</h3>
                <p className={`text-xs mb-4 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t('partner.desc')}</p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t('partner.cta')} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
            {/* Not launched yet: washed-out look + under-construction dialog on click. */}
            <GlassCard variant="highlight" onClick={() => setBuildingOpen(true)} className="p-5 h-full group opacity-55 saturate-50">
              <div className="absolute inset-0 premium-shimmer opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <div className="ios-glass-inset w-10 h-10 flex items-center justify-center">
                    <Globe size={18} className={isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'} />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-amber-500/90 !bg-amber-500/10 !border-amber-500/15">
                      {t('fi.badgeOffline')}
                    </GlassChip>
                    <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-sky-400 !bg-sky-500/10 !border-sky-500/15">
                      {t('fi.badgeDemo')}
                    </GlassChip>
                  </div>
                </div>
                <h3 className="site-card-title mb-1">{t('fi.title')}</h3>
                <p className={`text-xs mb-1 text-pretty-wrap leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/50'}`}>{t('fi.desc')}</p>
                <p className={`text-[10px] mb-0.5 font-medium ${isDark ? 'text-white/30' : 'text-[#160510]/40'}`}>
                  {t('fi.bribeMarket')} · {t('fi.badgeOffline')}
                </p>
                <p className={`text-[9px] mb-4 leading-relaxed ${isDark ? 'text-white/25' : 'text-[#160510]/30'}`}>
                  {t('fi.incompleteHint')}
                </p>
                <span className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>
                  {t('fi.cta')} <ArrowRight size={12} />
                </span>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Protocol announcements are seeded demo numbers for the not-yet-live
            bribe market — only the demo line-leader session should see them. */}
        {isDemoWallet(wallet) && (
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4 }}>
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h3 className="site-section-title">{t('page.announcements')}</h3>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/45'}`}>{t('page.protocolPublic')}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-amber-500/90 !bg-amber-500/10 !border-amber-500/15">
                  {t('fi.badgeOffline')}
                </GlassChip>
                <GlassChip className="!py-0.5 !px-2 text-[9px] font-semibold text-sky-400 !bg-sky-500/10 !border-sky-500/15">
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
