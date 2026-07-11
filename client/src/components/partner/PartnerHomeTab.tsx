import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, Zap } from 'lucide-react';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerPaymentConfirmSection } from '@/components/partner/PartnerPaymentConfirmSection';
import { PartnerReferralLoading } from '@/components/partner/PartnerReferralLoading';
import { PartnerTagChip } from '@/components/partner/partnerUiKit';
import {
  calcDailyUsdtYield,
  DEFAULT_HOME_STAKE_USDT,
  DAILY_YIELD_PCT,
  formatDailyYieldUsdt,
  isValidRegularStakeAmount,
  PARTNER_ENTRY_USDT,
  REGULAR_STAKE_MIN_USDT,
  REGULAR_STAKE_STEP_USDT,
  STAKE_LOCK_DAYS,
  type PartnerState,
} from '@/components/partner/partnerData';
import { getSd3Available } from '@/components/partner/partnerSd3View';
import { PartnerSd3Amount } from '@/components/partner/partnerUiKit';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';
import type { DepositIntent } from '@/lib/depositApi';

export function PartnerHomeTab({
  lang,
  isDark,
  state,
  hasReferralBound,
  referralLoading,
  minCrowdfundUsdt,
  isDemo = false,
  paying,
  lastDepositIntent,
  onHomeStake,
  onGoTeamTransferGuide,
}: {
  lang: AppLang;
  isDark: boolean;
  state: PartnerState;
  hasReferralBound: boolean;
  referralLoading?: boolean;
  minCrowdfundUsdt: number;
  isDemo?: boolean;
  paying: boolean;
  lastDepositIntent?: DepositIntent | null;
  onHomeStake: (amount: number, withPartnerJoin: boolean) => Promise<boolean>;
  onGoTeamTransferGuide?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const [amount, setAmount] = useState(String(DEFAULT_HOME_STAKE_USDT));
  const [becomePartner, setBecomePartner] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sd3GateOpen, setSd3GateOpen] = useState(false);

  const numAmount = Number(amount);
  const isRegularMode = !state.isPartner && !becomePartner;
  const withPartnerJoin = !state.isPartner && becomePartner;
  const stakeAmount = withPartnerJoin ? PARTNER_ENTRY_USDT : numAmount;

  const isValidAmount = useMemo(() => {
    if (withPartnerJoin) return true;
    if (!Number.isFinite(numAmount)) return false;
    if (isRegularMode) return isValidRegularStakeAmount(numAmount);
    return numAmount >= minCrowdfundUsdt;
  }, [numAmount, isRegularMode, minCrowdfundUsdt, withPartnerJoin]);

  const quickIncrements = [100, 500, 1000, 5000];
  const dailyYieldUsdt = isValidAmount ? calcDailyUsdtYield(stakeAmount) : 0;
  const sd3Balance = getSd3Available(state);

  const addAmount = (delta: number) => {
    if (withPartnerJoin) return;
    const base = Number.isFinite(numAmount) ? numAmount : 0;
    let next = base + delta;
    if (isRegularMode) {
      next = Math.max(REGULAR_STAKE_MIN_USDT, Math.round(next / REGULAR_STAKE_STEP_USDT) * REGULAR_STAKE_STEP_USDT);
    } else {
      next = Math.max(minCrowdfundUsdt, next);
    }
    setAmount(String(next));
  };

  const handleTogglePartner = (checked: boolean) => {
    setBecomePartner(checked);
    if (checked) {
      setAmount(String(PARTNER_ENTRY_USDT));
    } else {
      const n = Number.isFinite(numAmount) ? numAmount : DEFAULT_HOME_STAKE_USDT;
      const rounded = Math.max(REGULAR_STAKE_MIN_USDT, Math.floor(n / REGULAR_STAKE_STEP_USDT) * REGULAR_STAKE_STEP_USDT);
      setAmount(String(rounded));
    }
  };

  const confirmStake = async () => {
    if (!isValidAmount) return;
    const ok = await onHomeStake(stakeAmount, withPartnerJoin);
    if (ok) {
      setConfirmOpen(false);
      setAmount(String(DEFAULT_HOME_STAKE_USDT));
      if (!state.isPartner) setBecomePartner(true);
    }
  };

  if (referralLoading) {
    return <PartnerReferralLoading label={p('referral.checking')} isDark={isDark} className="min-h-[55vh]" />;
  }

  if (!hasReferralBound) {
    return (
      <div className={`text-center py-16 text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
        {p('referral.required')}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-11rem)] py-4">
      {state.isPartner && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <GlassChip className="!py-1.5 !px-3 text-xs font-bold text-emerald-400 !bg-emerald-500/10 !border-emerald-500/20">
            <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />
            {p('home.isPartner')}
            {state.joinedAt ? ` · ${state.joinedAt}` : ''}
          </GlassChip>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm mx-auto"
      >
        <motion.div
          className="absolute -inset-4 rounded-[2rem] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 40%, rgba(224,86,143,0.22) 0%, transparent 70%)',
          }}
          animate={{ opacity: [0.45, 0.75, 0.45], scale: [0.98, 1.02, 0.98] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -top-6 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-3xl pointer-events-none bg-[#E0568F]/20"
          animate={{ opacity: [0.3, 0.55, 0.3], y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className={`partner-elevated-card partner-stake-hero p-6 sm:p-7 relative ${glassCardClass('highlight', '')}`}>
          <span className="ios-glass-sheen pointer-events-none" aria-hidden />
          <motion.div
            className="absolute top-4 right-4 text-[#E0568F]/40"
            animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles size={18} />
          </motion.div>

          <div className="relative text-center mb-5">
            <motion.div
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 bg-[#E0568F]/10 text-[#E0568F] shadow-lg shadow-[#E0568F]/10"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Zap size={26} strokeWidth={2.25} />
            </motion.div>
            <h2 className={`text-lg font-bold tracking-tight mb-2 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {p('home.stakeTitle')}
            </h2>
            <div className="flex flex-wrap justify-center gap-1.5 mb-1">
              <PartnerTagChip accent>{p('home.tagDays', { days: STAKE_LOCK_DAYS })}</PartnerTagChip>
              <PartnerTagChip accent>{p('home.tagDoubleExit')}</PartnerTagChip>
              <PartnerTagChip>{p('home.tagDailyYield', { pct: DAILY_YIELD_PCT })}</PartnerTagChip>
            </div>
          </div>

          <div className="relative mb-4">
            <div className={`text-[10px] font-semibold uppercase tracking-widest text-center mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
              USDT
            </div>
            <input
              type="number"
              min={isRegularMode ? REGULAR_STAKE_MIN_USDT : minCrowdfundUsdt}
              step={isRegularMode ? REGULAR_STAKE_STEP_USDT : 'any'}
              value={withPartnerJoin ? String(PARTNER_ENTRY_USDT) : amount}
              readOnly={withPartnerJoin}
              onChange={(e) => {
                if (withPartnerJoin) return;
                setAmount(e.target.value);
              }}
              placeholder={
                isRegularMode
                  ? p('home.stakeRegularPlaceholder', { min: REGULAR_STAKE_MIN_USDT, step: REGULAR_STAKE_STEP_USDT })
                  : p('home.stakePartnerPlaceholder', { default: PARTNER_ENTRY_USDT })
              }
              className={`w-full partner-depth-inset px-4 py-4 text-3xl font-bold text-center rounded-2xl outline-none tracking-tight ${
                isDark ? 'text-white bg-transparent' : 'text-[#160510]'
              } ${withPartnerJoin ? 'opacity-80 cursor-not-allowed' : ''}`}
            />
          </div>

          {!withPartnerJoin && (
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            {quickIncrements.map((v, i) => (
              <motion.button
                key={v}
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                onClick={() => addAmount(v)}
                className="text-xs px-3.5 py-1.5 rounded-full partner-depth-inset ios-glass-pressable font-semibold text-[#E0568F] transition-colors"
              >
                +{v.toLocaleString()}
              </motion.button>
            ))}
          </div>
          )}
          {withPartnerJoin && <div className="mb-5" />}

          {!state.isPartner && (
            <label
              className={`flex items-start gap-2.5 cursor-pointer partner-depth-inset rounded-xl px-3.5 py-3 mb-4 ${
                isDark ? 'text-white/75' : 'text-[#160510]/75'
              }`}
            >
              <input
                type="checkbox"
                checked={becomePartner}
                onChange={(e) => handleTogglePartner(e.target.checked)}
                className="mt-0.5 accent-[#E0568F] shrink-0 scale-110"
              />
              <span className="text-[11px] leading-relaxed text-left">
                <span className="font-semibold">{p('home.becomePartnerCheckbox')}</span>
                <span className={`block text-[10px] mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                  {p('home.becomePartnerCheckboxHint', { fee: PARTNER_ENTRY_USDT.toLocaleString() })}
                </span>
              </span>
            </label>
          )}

          {isRegularMode && (
            <p className={`text-[10px] text-center mb-4 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
              {p('home.stakeStepHint', { step: REGULAR_STAKE_STEP_USDT })}
            </p>
          )}

          <motion.div whileTap={{ scale: 0.98 }}>
            <GlassButton
              className="w-full !py-4 !text-base font-bold flex items-center justify-center gap-2"
              disabled={!isValidAmount}
              onClick={() => setConfirmOpen(true)}
            >
              <Zap size={18} />
              {p('home.stakeOneClick')}
            </GlassButton>
          </motion.div>

          {isValidAmount && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-2"
            >
              <div className="partner-depth-inset rounded-xl px-3 py-2.5 flex justify-between items-center">
                <span className={`text-[11px] ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>{p('home.estDailyYield')}</span>
                <span className="text-sm font-bold text-emerald-500">${formatDailyYieldUsdt(dailyYieldUsdt)}</span>
              </div>
              <button
                type="button"
                onClick={() => setSd3GateOpen(true)}
                className={`w-full partner-depth-inset rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left ios-glass-pressable ${
                  isDark ? 'text-white/75' : 'text-[#160510]/75'
                }`}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={false}
                  tabIndex={-1}
                  aria-hidden
                  className="mt-0.5 accent-[#E0568F] shrink-0 scale-110 pointer-events-none"
                />
                <span className="text-[11px] leading-relaxed">
                  <span className="font-semibold">{p('home.sd3QuotaLabel')}</span>
                  <span className="block text-sm font-bold text-[#E0568F] mt-0.5">
                    <PartnerSd3Amount value={sd3Balance} />
                  </span>
                  <span className={`block text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                    {p('home.sd3QuotaHintBefore')}
                    <button
                      type="button"
                      className="underline underline-offset-2 text-[#E0568F] font-semibold mx-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoTeamTransferGuide?.();
                      }}
                    >
                      {p('home.sd3TransferDownlineLink')}
                    </button>
                  </span>
                </span>
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>

      <PartnerModal
        open={confirmOpen}
        onClose={() => !paying && setConfirmOpen(false)}
        title={isDemo ? p('home.demoConfirmStakeTitle') : p('home.confirmStakeTitle')}
        isDark={isDark}
      >
        <div className="space-y-2 mb-5">
          <div className="partner-depth-inset p-4 text-center rounded-2xl">
            <div className={`text-[10px] uppercase tracking-widest mb-1 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
              {withPartnerJoin ? p('stake.partner') : p('stake.stakeAmount')}
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[#E0568F]">{stakeAmount.toLocaleString()}</div>
            <div className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>USDT</div>
          </div>
        </div>
        <PartnerPaymentConfirmSection
          isDemo={isDemo}
          amountUsdt={stakeAmount}
          depositIntent={lastDepositIntent}
          isDark={isDark}
          label={p}
        />
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <GlassButton variant="secondary" className="w-full sm:flex-1 !py-3" disabled={paying} onClick={() => setConfirmOpen(false)}>
            {p('stake.cancel')}
          </GlassButton>
          <GlassButton className="w-full sm:flex-1 !py-3" disabled={paying || !isValidAmount} onClick={() => void confirmStake()}>
            {paying ? (isDemo ? p('stake.demoPaying') : p('stake.paying')) : isDemo ? p('stake.demoConfirm') : p('stake.confirm')}
          </GlassButton>
        </div>
      </PartnerModal>

      <PartnerModal
        open={sd3GateOpen}
        onClose={() => setSd3GateOpen(false)}
        title={p('home.sd3LaunchGateTitle')}
        isDark={isDark}
      >
        <p className={`text-sm leading-relaxed mb-5 ${isDark ? 'text-white/70' : 'text-[#160510]/65'}`}>
          {p('home.sd3LaunchGateBody')}
        </p>
        <GlassButton className="w-full !py-3" onClick={() => setSd3GateOpen(false)}>
          {p('guide.done')}
        </GlassButton>
      </PartnerModal>
    </div>
  );
}
