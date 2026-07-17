import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sparkles, Zap } from 'lucide-react';
import { glassCardClass, GlassButton, GlassChip } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerPaymentConfirmSection } from '@/components/partner/PartnerPaymentConfirmSection';
import { PartnerReferralLoading } from '@/components/partner/PartnerReferralLoading';
import { PartnerTagChip } from '@/components/partner/partnerUiKit';
import {
  calcDailyD3Release,
  calcDailyUsdtYield,
  CROWDFUND_UNIT_PRICE_USDT,
  DEFAULT_HOME_STAKE_USDT,
  DAILY_YIELD_PCT,
  formatD3Amount,
  isValidRegularStakeAmount,
  isValidUd3StakeAmount,
  PARTNER_ENTRY_USDT,
  REGULAR_STAKE_MIN_USDT,
  REGULAR_STAKE_STEP_USDT,
  UD3_STAKE_MIN,
  UD3_STAKE_STEP,
  STAKE_EXIT_MULTIPLIER_DEFAULT,
  STAKE_EXIT_MULTIPLIER_SD3,
  STAKE_LOCK_DAYS,
  usdtToD3,
  type PartnerState,
} from '@/components/partner/partnerData';
import { getUd3Available } from '@/components/partner/partnerUd3View';
import { PartnerUd3Amount } from '@/components/partner/partnerUiKit';
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
  onStakeUd3,
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
  onStakeUd3: (amount: number) => Promise<boolean>;
  onGoTeamTransferGuide?: () => void;
}) {
  const p = usePartnerTranslation(lang);
  const [amount, setAmount] = useState(String(DEFAULT_HOME_STAKE_USDT));
  const [becomePartner, setBecomePartner] = useState(true);
  const [useUd3, setUseUd3] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const availableUd3 = getUd3Available(state);
  const numAmount = Number(amount);
  const isRegularMode = !state.isPartner && !becomePartner && !useUd3;
  const withPartnerJoin = !state.isPartner && becomePartner && !useUd3;
  const stakeAmount = withPartnerJoin ? PARTNER_ENTRY_USDT : numAmount;
  const exitMultiplier = useUd3 ? STAKE_EXIT_MULTIPLIER_SD3 : STAKE_EXIT_MULTIPLIER_DEFAULT;

  const isValidAmount = useMemo(() => {
    if (withPartnerJoin) return true;
    if (!Number.isFinite(numAmount)) return false;
    if (useUd3) return isValidUd3StakeAmount(numAmount, availableUd3);
    if (isRegularMode) return isValidRegularStakeAmount(numAmount);
    return numAmount >= minCrowdfundUsdt;
  }, [numAmount, isRegularMode, minCrowdfundUsdt, withPartnerJoin, useUd3, availableUd3]);

  const quickIncrements = [100, 500, 1000, 5000];
  const dailyYieldUsdt = isValidAmount ? calcDailyUsdtYield(stakeAmount) : 0;
  const dailyD3 = isValidAmount ? calcDailyD3Release(stakeAmount) : 0;
  const crowdfundD3 = isValidAmount ? usdtToD3(stakeAmount) : 0;

  const clampUd3Amount = (raw: number) => {
    const stepped = Math.max(UD3_STAKE_MIN, Math.floor(raw / UD3_STAKE_STEP) * UD3_STAKE_STEP);
    const maxStep = Math.floor(availableUd3 / UD3_STAKE_STEP) * UD3_STAKE_STEP;
    return Math.min(stepped, Math.max(0, maxStep));
  };

  const addAmount = (delta: number) => {
    if (withPartnerJoin) return;
    const base = Number.isFinite(numAmount) ? numAmount : 0;
    let next = base + delta;
    if (useUd3) {
      next = clampUd3Amount(next);
      setAmount(String(next > 0 ? next : UD3_STAKE_MIN));
      return;
    }
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
      setUseUd3(false);
      setAmount(String(PARTNER_ENTRY_USDT));
    } else {
      // Non-partner (regular) stake defaults to the 100 USDT minimum; user can edit.
      setAmount(String(REGULAR_STAKE_MIN_USDT));
    }
  };

  const handleToggleUseUd3 = (checked: boolean) => {
    if (checked && availableUd3 < UD3_STAKE_MIN) return;
    setUseUd3(checked);
    if (checked) {
      setBecomePartner(false);
      setAmount(String(clampUd3Amount(Math.min(DEFAULT_HOME_STAKE_USDT, availableUd3)) || UD3_STAKE_MIN));
    } else if (!state.isPartner) {
      setBecomePartner(true);
      setAmount(String(PARTNER_ENTRY_USDT));
    } else {
      setAmount(String(DEFAULT_HOME_STAKE_USDT));
    }
  };

  const confirmStake = async () => {
    if (!isValidAmount) return;
    const ok = useUd3
      ? await onStakeUd3(stakeAmount)
      : await onHomeStake(stakeAmount, withPartnerJoin);
    if (ok) {
      setConfirmOpen(false);
      setUseUd3(false);
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
            <p className={`text-[11px] mb-2 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
              {useUd3
                ? p('home.ud3StakeSubtitle')
                : p('home.d3CrowdfundPrice', { price: CROWDFUND_UNIT_PRICE_USDT })}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mb-1">
              <PartnerTagChip accent>{p('home.tagDays', { days: STAKE_LOCK_DAYS })}</PartnerTagChip>
              <PartnerTagChip>{p('home.tagDailyYield', { pct: DAILY_YIELD_PCT })}</PartnerTagChip>
              <PartnerTagChip>{p('home.tagExitMult', { mult: exitMultiplier })}</PartnerTagChip>
            </div>
          </div>

          <div className="relative mb-4">
            <div className={`text-[10px] font-semibold uppercase tracking-widest text-center mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>
              {useUd3 ? 'UD3' : 'USDT'}
            </div>
            <input
              type="number"
              min={useUd3 ? UD3_STAKE_MIN : isRegularMode ? REGULAR_STAKE_MIN_USDT : minCrowdfundUsdt}
              step={useUd3 || isRegularMode ? REGULAR_STAKE_STEP_USDT : 'any'}
              max={useUd3 ? availableUd3 : undefined}
              value={withPartnerJoin ? String(PARTNER_ENTRY_USDT) : amount}
              readOnly={withPartnerJoin}
              onChange={(e) => {
                if (withPartnerJoin) return;
                setAmount(e.target.value);
              }}
              placeholder={
                useUd3
                  ? p('home.stakeUd3Placeholder', { min: UD3_STAKE_MIN, step: UD3_STAKE_STEP, max: availableUd3 })
                  : isRegularMode
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

          {!state.isPartner && !useUd3 && (
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

          {(useUd3 || isRegularMode) && (
            <p className={`text-[10px] text-center mb-4 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
              {useUd3
                ? p('home.stakeUd3StepHint', { step: UD3_STAKE_STEP })
                : p('home.stakeStepHint', { step: REGULAR_STAKE_STEP_USDT })}
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
              className="mt-4 space-y-2.5"
            >
              {!useUd3 && (
              <div className="partner-depth-inset rounded-2xl overflow-hidden">
                <div className="px-4 py-3.5">
                  <div className={`text-[10px] font-semibold tracking-wide ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                    {p('home.estD3Amount', { amount: stakeAmount.toLocaleString(), price: CROWDFUND_UNIT_PRICE_USDT })}
                  </div>
                  <div className="mt-1.5 text-xl font-bold tracking-tight text-[#E0568F]">
                    {formatD3Amount(crowdfundD3)}
                    <span className="ml-1 text-xs font-semibold opacity-70">D3</span>
                  </div>
                </div>
                <div className={`h-px mx-4 ${isDark ? 'bg-white/[0.06]' : 'bg-[#160510]/06'}`} />
                <div className="px-4 py-3.5">
                  <div className={`text-[10px] font-semibold tracking-wide ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                    {p('home.estDailyYield')}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl font-bold tracking-tight text-emerald-500">
                      {formatD3Amount(dailyD3)}
                      <span className="ml-1 text-xs font-semibold opacity-70">D3</span>
                    </span>
                  </div>
                  <div className={`mt-2 text-[11px] leading-relaxed tabular-nums ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                    {p('home.estDailyD3Hint', {
                      pct: DAILY_YIELD_PCT,
                      usdt: Number(dailyYieldUsdt.toFixed(4)).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      }),
                    })}
                  </div>
                </div>
              </div>
              )}
              {useUd3 && (
                <div className="partner-depth-inset rounded-2xl px-4 py-3.5">
                  <div className={`text-[10px] font-semibold tracking-wide ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                    {p('home.estDailyYield')}
                  </div>
                  <div className={`mt-2 text-[11px] leading-relaxed tabular-nums ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                    {p('home.estDailyD3Hint', {
                      pct: DAILY_YIELD_PCT,
                      usdt: Number(dailyYieldUsdt.toFixed(4)).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      }),
                    })}
                  </div>
                  <div className={`mt-1.5 text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                    {p('home.ud3NoBribeHint')}
                  </div>
                </div>
              )}
              <label
                className={`w-full partner-depth-inset rounded-2xl px-4 py-3.5 flex items-start gap-2.5 text-left cursor-pointer ${
                  availableUd3 < UD3_STAKE_MIN ? 'opacity-55 cursor-not-allowed' : 'ios-glass-pressable'
                } ${isDark ? 'text-white/75' : 'text-[#160510]/75'}`}
              >
                <input
                  type="checkbox"
                  checked={useUd3}
                  disabled={availableUd3 < UD3_STAKE_MIN}
                  onChange={(e) => handleToggleUseUd3(e.target.checked)}
                  className="mt-0.5 accent-[#E0568F] shrink-0 scale-110"
                />
                <span className="text-[11px] leading-relaxed min-w-0">
                  <span className="font-semibold">{p('home.ud3QuotaLabel')}</span>
                  <span className="block text-sm font-bold text-[#E0568F] mt-0.5">
                    <PartnerUd3Amount value={availableUd3} />
                  </span>
                  <span className={`block text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                    {p('home.ud3QuotaHintOpen')}
                    <button
                      type="button"
                      className="underline underline-offset-2 text-[#E0568F] font-semibold mx-0.5"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onGoTeamTransferGuide?.();
                      }}
                    >
                      {p('home.ud3TransferDownlineLink')}
                    </button>
                  </span>
                </span>
              </label>
            </motion.div>
          )}

          {!isValidAmount && (
            <div className="mt-4">
              <label
                className={`w-full partner-depth-inset rounded-2xl px-4 py-3.5 flex items-start gap-2.5 text-left cursor-pointer ${
                  availableUd3 < UD3_STAKE_MIN ? 'opacity-55 cursor-not-allowed' : 'ios-glass-pressable'
                } ${isDark ? 'text-white/75' : 'text-[#160510]/75'}`}
              >
                <input
                  type="checkbox"
                  checked={useUd3}
                  disabled={availableUd3 < UD3_STAKE_MIN}
                  onChange={(e) => handleToggleUseUd3(e.target.checked)}
                  className="mt-0.5 accent-[#E0568F] shrink-0 scale-110"
                />
                <span className="text-[11px] leading-relaxed min-w-0">
                  <span className="font-semibold">{p('home.ud3QuotaLabel')}</span>
                  <span className="block text-sm font-bold text-[#E0568F] mt-0.5">
                    <PartnerUd3Amount value={availableUd3} />
                  </span>
                  <span className={`block text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
                    {p('home.ud3QuotaHintOpen')}
                  </span>
                </span>
              </label>
            </div>
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
              {useUd3 ? p('stake.kind.sd3') : withPartnerJoin ? p('stake.partner') : p('stake.stakeAmount')}
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[#E0568F]">{stakeAmount.toLocaleString()}</div>
            <div className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
              {useUd3 ? 'UD3' : 'USDT'}
            </div>
            <div className={`text-[10px] mt-2 ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
              {p('home.tagExitMult', { mult: exitMultiplier })}
            </div>
          </div>
        </div>
        {!useUd3 && (
          <PartnerPaymentConfirmSection
            isDemo={isDemo}
            amountUsdt={stakeAmount}
            depositIntent={lastDepositIntent}
            paying={paying}
            isDark={isDark}
            label={p}
          />
        )}
        {useUd3 && (
          <p className={`text-[11px] text-center mb-4 ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            {p('home.ud3ConfirmHint')}
          </p>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <GlassButton variant="secondary" className="w-full sm:flex-1 !py-3" disabled={paying} onClick={() => setConfirmOpen(false)}>
            {p('stake.cancel')}
          </GlassButton>
          <GlassButton className="w-full sm:flex-1 !py-3" disabled={paying || !isValidAmount} onClick={() => void confirmStake()}>
            {paying ? (isDemo ? p('stake.demoPaying') : p('stake.paying')) : isDemo ? p('stake.demoConfirm') : p('stake.confirm')}
          </GlassButton>
        </div>
      </PartnerModal>
    </div>
  );
}
