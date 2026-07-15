import { useMemo } from 'react';
import { Compass, UserRound } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { type Sd3SettlementRecord } from '@/components/partner/partnerData';
import { UD3_DIRECT_SHARE, UD3_NETWORK_SHARE } from '@/components/partner/ud3Rules';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Metric({
  label,
  value,
  hint,
  isDark,
}: {
  label: string;
  value: string;
  hint?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-2.5 py-2 min-w-0 ${
        isDark ? 'bg-white/[0.035]' : 'bg-[#160510]/[0.035]'
      }`}
    >
      <div
        className={`text-[9px] font-semibold tracking-[0.06em] uppercase mb-1 ${
          isDark ? 'text-white/35' : 'text-[#160510]/38'
        }`}
      >
        {label}
      </div>
      <div
        className={`text-[12px] font-bold tabular-nums leading-tight truncate ${
          isDark ? 'text-white/90' : 'text-[#160510]/90'
        }`}
      >
        {value}
        {hint ? (
          <span className={`ml-1 text-[10px] font-medium ${isDark ? 'text-white/35' : 'text-[#160510]/38'}`}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function PartnerUd3RewardRow({
  row,
  lang,
  isDark,
  onOpenDepositor,
  onOpenGuide,
}: {
  row: Sd3SettlementRecord;
  lang: AppLang;
  isDark: boolean;
  last?: boolean;
  onOpenDepositor?: (address: string) => void;
  onOpenGuide?: (address: string) => void;
}) {
  const p = usePartnerTranslation(lang);
  const isPending = row.settlementStatus === 'pending';
  const isDirect = row.role !== 'upline';

  const fx = useMemo(() => {
    const deposit = row.dailyNewPerformanceUsd;
    const ratePct = row.tierRatePct;
    const generated =
      row.generatedUd3 != null && row.generatedUd3 > 0
        ? row.generatedUd3
        : round2(deposit * (ratePct / 100));
    const gapPct = row.gapPct ?? row.rewardSharePct ?? 0;
    const tier = row.guideTierLabel ?? (ratePct > 0 ? 'S1' : '—');
    const depth = row.sourceDepth ?? (isDirect ? 1 : undefined);
    return { deposit, ratePct, generated, gapPct, tier, depth };
  }, [row, isDirect]);

  const attrLabel = isDirect
    ? p('team.sd3RoleDirect')
    : fx.depth != null
      ? p('team.ud3FromLayer', { n: fx.depth })
      : p('team.sd3RoleUpline');

  const iconBtn = `inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ios-glass-pressable ${
    isDark
      ? 'bg-white/[0.06] text-white/55 hover:text-[#E0568F] hover:bg-[#E0568F]/12'
      : 'bg-[#160510]/[0.05] text-[#160510]/45 hover:text-[#E0568F] hover:bg-[#E0568F]/10'
  }`;

  return (
    <article className={`partner-elevated-card overflow-hidden ${glassCardClass('default', '')}`}>
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />
      <div className="relative px-3.5 pt-3.5 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isPending
                    ? isDark
                      ? 'text-amber-200 bg-amber-500/15'
                      : 'text-amber-800 bg-amber-500/12'
                    : isDark
                      ? 'text-emerald-200 bg-emerald-500/15'
                      : 'text-emerald-800 bg-emerald-500/12'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isPending ? 'bg-amber-400' : 'bg-emerald-400'}`}
                />
                {isPending ? p('team.unsettledBadge') : p('team.settledBadge')}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDirect
                    ? 'text-[#E0568F] bg-[#E0568F]/12'
                    : isDark
                      ? 'text-[#F5D0A9] bg-[#F5D0A9]/10'
                      : 'text-[#8A2B57] bg-[#8A2B57]/10'
                }`}
              >
                {attrLabel}
              </span>
            </div>
            <div
              className={`text-[11px] tabular-nums ${isDark ? 'text-white/35' : 'text-[#160510]/38'}`}
            >
              {row.settledAt}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[18px] font-bold text-[#E0568F] tabular-nums leading-none tracking-tight">
              +{fmt(row.sd3Amount)}
            </div>
            <div
              className={`mt-1 text-[10px] font-semibold tracking-[0.12em] ${
                isDark ? 'text-white/30' : 'text-[#160510]/32'
              }`}
            >
              UD3
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Metric
            label={p('team.ud3FieldDeposit')}
            value={fmt(fx.deposit)}
            hint="USDT"
            isDark={isDark}
          />
          <Metric
            label={p('team.ud3FieldTier')}
            value={fx.tier}
            hint={`${fx.ratePct}%`}
            isDark={isDark}
          />
          <Metric
            label={p('team.ud3FieldBribe')}
            value={fmt(fx.generated)}
            hint="UD3"
            isDark={isDark}
          />
          <Metric label={p('team.ud3FieldAttr')} value={attrLabel} isDark={isDark} />
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border ${
            isDark
              ? 'border-white/[0.06] bg-gradient-to-r from-[#E0568F]/10 to-transparent'
              : 'border-[#E0568F]/12 bg-gradient-to-r from-[#E0568F]/08 to-transparent'
          }`}
        >
          <p
            className={`min-w-0 flex-1 text-[11px] font-medium tabular-nums leading-snug ${
              isDark ? 'text-white/65' : 'text-[#160510]/65'
            }`}
          >
            {isDirect
              ? p('team.ud3EqDirect', {
                  bribe: fmt(fx.generated),
                  share: Math.round(UD3_DIRECT_SHARE * 100),
                  amount: fmt(row.sd3Amount),
                })
              : p('team.ud3EqUpline', {
                  bribe: fmt(fx.generated),
                  pool: Math.round(UD3_NETWORK_SHARE * 100),
                  gap: fx.gapPct,
                  amount: fmt(row.sd3Amount),
                })}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {row.sourceAddress && (
              <button
                type="button"
                className={iconBtn}
                title={p('team.ud3JumpDepositor')}
                aria-label={p('team.ud3JumpDepositor')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenDepositor?.(row.sourceAddress!);
                }}
              >
                <UserRound size={14} strokeWidth={2.2} />
              </button>
            )}
            {row.guideAddress && (
              <button
                type="button"
                className={iconBtn}
                title={p('team.ud3JumpGuide')}
                aria-label={p('team.ud3JumpGuide')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenGuide?.(row.guideAddress!);
                }}
              >
                <Compass size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
