import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Coins, Gift, Globe2, Shield, Sparkles, Users, Zap } from 'lucide-react';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import {
  BRIBE_TIERS,
  CROWDFUND_TOKEN_SUPPLY,
  CROWDFUND_UNIT_PRICE_USDT,
  DAILY_YIELD_PCT,
  PARTNER_JOIN_USDT,
  type PartnerState,
} from '@/components/partner/partnerData';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

const TIER_KEYS = ['tier.proBribe', 'tier.seniorBribe', 'tier.director', 'tier.chief'] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

function formatTierVolume(min: number, max: number, lang: AppLang): string {
  if (lang === 'zh-CN' || lang === 'zh-TW') {
    const fmt = (n: number) => (n >= 100_000 ? `${n / 10_000}万` : String(n));
    return `${fmt(min)}–${fmt(max)}U`;
  }
  const fmt = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : String(n));
  return `${fmt(min)}–${fmt(max)} USDT`;
}

function PartnerTiersInline({ lang, isDark }: { lang: AppLang; isDark: boolean }) {
  const p = usePartnerTranslation(lang);

  return (
    <div className="mt-4 pt-4 border-t border-[#E0568F]/10">
      <div className="site-section-title mb-2 text-[11px]">{p('home.tiersTitle')}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {BRIBE_TIERS.map((tier, i) => (
          <div key={TIER_KEYS[i]} className="partner-depth-inset rounded-lg px-2.5 py-2">
            <div className="flex items-center justify-between gap-1">
              <span className={`text-[10px] font-bold truncate ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                {p(TIER_KEYS[i])}
              </span>
              <span className="text-xs font-bold text-[#E0568F] shrink-0">{tier.ratePct}%</span>
            </div>
            <div className={`text-[9px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
              {formatTierVolume(tier.min, tier.max, lang)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartnerIntro({ lang, isDark }: { lang: AppLang; isDark: boolean }) {
  const p = usePartnerTranslation(lang);

  const benefits = [
    { icon: Globe2, label: p('benefit.globalTree') },
    { icon: Coins, label: p('benefit.price', { price: CROWDFUND_UNIT_PRICE_USDT }) },
    { icon: Zap, label: p('benefit.static', { pct: DAILY_YIELD_PCT }) },
    { icon: Gift, label: p('benefit.antibribe') },
    { icon: Shield, label: p('benefit.investor') },
    { icon: Sparkles, label: p('benefit.contract') },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
      <motion.div variants={fadeUp} className={`partner-elevated-card p-4 ${glassCardClass('highlight', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={14} className="text-[#E0568F]" />
            <span className="site-stat-label">{p('home.badge')}</span>
          </div>
          <h2 className={`text-base font-bold leading-snug mb-1.5 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('home.headline')}
          </h2>
          <p className={`text-[11px] leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            {p('home.subline', { supply: CROWDFUND_TOKEN_SUPPLY.toLocaleString() })}
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={`partner-elevated-card p-3.5 ${glassCardClass('default', '')}`}>
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="site-section-title mb-2 text-[11px]">{p('home.benefitsTitle')}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {benefits.map(({ icon: Icon, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.04 }}
              className={`flex flex-col items-center gap-1 partner-depth-inset rounded-lg px-1.5 py-2 text-center ${isDark ? 'text-white/75' : 'text-[#160510]/75'}`}
            >
              <Icon size={13} className="text-[#E0568F] shrink-0" strokeWidth={2.25} />
              <span className="text-[9px] font-semibold leading-tight">{label}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PartnerHomeTab({
  lang,
  isDark,
  state,
  hasReferralBound,
  onGoPartnerJoin,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  hasReferralBound: boolean;
  onGoPartnerJoin: () => void;
}) {
  const p = usePartnerTranslation(lang);

  if (!hasReferralBound) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('referral.required')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PartnerIntro lang={lang} isDark={isDark} />

      {!state.isPartner ? (
        <div className={`partner-elevated-card p-5 ${glassCardClass('highlight', '')}`}>
          <span className="ios-glass-sheen pointer-events-none" aria-hidden />
          <div className="relative">
            <div className={`text-sm font-semibold tracking-tight mb-1 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {p('home.becomePartner')}
            </div>
            <p className={`text-[11px] leading-relaxed mb-4 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {p('home.becomeDesc', { fee: PARTNER_JOIN_USDT.toLocaleString() })}
            </p>
            <GlassButton className="w-full !py-3.5 flex items-center justify-center gap-2" onClick={onGoPartnerJoin}>
              <Users size={16} />
              {p('home.goJoin')}
              <ArrowRight size={14} />
            </GlassButton>
            <PartnerTiersInline lang={lang} isDark={isDark} />
          </div>
        </div>
      ) : (
        <div className={`partner-elevated-card p-4 ${glassCardClass('default', '')}`}>
          <span className="ios-glass-sheen pointer-events-none" aria-hidden />
          <GlassChip className="!py-1.5 !px-3 text-xs font-bold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/20">
            <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />
            {p('home.isPartner')}
            {state.joinedAt ? ` · ${state.joinedAt}` : ''}
          </GlassChip>
          <PartnerTiersInline lang={lang} isDark={isDark} />
        </div>
      )}
    </div>
  );
}
