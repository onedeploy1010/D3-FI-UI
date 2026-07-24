import { useCallback, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { copyToClipboard } from '@/lib/copyToClipboard';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

export function PartnerReferralCard({
  lang,
  isDark,
  referralLink,
}: {
  lang: AppLang;
  isDark: boolean;
  referralLink: string;
}) {
  const p = usePartnerTranslation(lang);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(referralLink);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  }, [referralLink]);

  const panel = isDark
    ? 'bg-black/20 border border-white/10'
    : 'bg-white/90 border border-[#8A2B57]/14 shadow-sm';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`partner-elevated-card partner-referral-hero overflow-hidden ${glassCardClass('highlight', '')}`}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />
      <div className="partner-referral-hero-glow pointer-events-none" aria-hidden />

      <div className="relative p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isDark ? 'bg-[#E0568F]/20 text-[#f9a8d4]' : 'bg-[#E0568F]/12 text-[#8A2B57]'
            }`}
          >
            <Link2 size={18} strokeWidth={2.2} />
          </div>
          <h3 className={`text-[15px] font-bold tracking-tight min-w-0 flex-1 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
            {p('team.referralTitle')}
          </h3>
        </div>

        <div
          className={`rounded-2xl px-4 py-3.5 ${panel}`}
          onClick={() => void handleCopy()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void handleCopy();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={p('team.copyLink')}
        >
          <p
            className={`text-[11px] font-mono leading-relaxed break-all select-text ${
              isDark ? 'text-white/85' : 'text-[#160510]/90'
            }`}
          >
            {referralLink}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          className={`partner-raised-btn partner-raised-btn-primary partner-referral-copy-btn w-full min-h-[48px] mt-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 ios-glass-pressable touch-manipulation ${
            copied ? 'ring-2 ring-emerald-400/50' : ''
          } ${isDark ? 'partner-referral-copy-btn-dark' : ''}`}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {copied ? (
            <>
              <Check size={16} className="text-emerald-300" aria-hidden />
              <span className="text-white">{p('team.copied')}</span>
            </>
          ) : (
            <>
              <Copy size={16} className="text-white/95" aria-hidden />
              <span className="text-white">{p('team.copyLink')}</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
