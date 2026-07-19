import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Activity, Radio, ChevronRight, TrendingUp } from 'lucide-react';
import { glassCardClass } from '@/components/ui/GlassSurface';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { getHeartbeat, type HeartbeatData, type HeartbeatOrder } from '@/lib/unionApi';
import {
  PRESALE_ROUNDS,
  ROUND_ACCENTS,
  shortenAddr,
  shortenHash,
  ageSeconds,
  type StreamOrder,
} from '@/components/partner/presaleHeartbeat';
import type { AppLang } from '@/i18n/types';
import { usePartnerTranslation } from '@/i18n/usePartnerTranslation';

type P = ReturnType<typeof usePartnerTranslation>;

/** How often the widget re-fetches server heartbeat data (cumulative orders). */
const POLL_MS = 45_000;

/** Map a server heartbeat order into the local row shape the UI renders. */
function toStreamOrders(list: HeartbeatOrder[]): StreamOrder[] {
  return list.map((o, i) => ({
    id: `${o.source}-${o.at}-${i}`,
    hash: o.hash ?? '',
    address: o.address,
    amountUsdt: o.amountUsdt,
    d3: o.d3,
    round: o.round || 1,
    priceUsdt: 0,
    at: o.at,
  }));
}

/** Relative age, localized. */
function useTimeAgo(p: P) {
  return useMemo(
    () => (at: number, now: number) => {
      const s = ageSeconds(at, now);
      if (s < 5) return p('heartbeat.justNow');
      if (s < 60) return p('heartbeat.secondsAgo', { n: s });
      return p('heartbeat.minutesAgo', { n: Math.floor(s / 60) });
    },
    [p],
  );
}

/* ------------------------------------------------------------------ */
/* ECG heartbeat trace                                                */
/* ------------------------------------------------------------------ */

/** One P-QRS-T beat, 100 units wide, baseline y=22 — drawn twice for seamless scroll. */
const BEAT =
  'M0,22 L16,22 q4,-5 8,0 L34,22 L38,22 L40,9 L43,35 L46,5 L49,29 L52,22 L64,22 q6,-9 12,0 L100,22';

/**
 * A scrolling ECG line that conveys the “心跳指数”. Two beat cycles translate left
 * in a seamless loop; a glowing head-dot rides the right edge. `pulseKey` bumps on
 * each new order to flash the trace brighter. Respects reduced-motion.
 */
function EcgTrace({ pulseKey, reduce }: { pulseKey: number; reduce: boolean | null }) {
  return (
    <div className="relative h-11 w-full overflow-hidden" aria-hidden>
      <svg viewBox="0 0 200 44" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="hb-ecg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8A2B57" stopOpacity="0.15" />
            <stop offset="55%" stopColor="#B23A6E" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#E0568F" />
          </linearGradient>
        </defs>
        <motion.g
          initial={false}
          animate={reduce ? undefined : { x: [0, -100] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        >
          <path d={BEAT} fill="none" stroke="url(#hb-ecg)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          <path
            d={BEAT}
            transform="translate(100 0)"
            fill="none"
            stroke="url(#hb-ecg)"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </motion.g>
      </svg>
      {/* Head glow that flares on each incoming order */}
      <motion.span
        key={pulseKey}
        className="absolute top-1/2 right-2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#E0568F]"
        style={{ boxShadow: '0 0 10px 3px rgba(224,86,143,0.65)' }}
        initial={reduce ? false : { scale: 0.6, opacity: 0.6 }}
        animate={{ scale: [0.9, 1.5, 1], opacity: [0.8, 1, 0.85] }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

/**
 * Four bars stepping upward, pulsing on the same 1.15s heartbeat tempo — a
 * “price rises each round” indicator that beats in time with the index.
 */
function RisingBars({ reduce }: { reduce: boolean | null }) {
  return (
    <div className="flex items-end gap-[3px] h-6" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: ROUND_ACCENTS[i], height: 7 + i * 4, transformOrigin: 'bottom' }}
          animate={reduce ? undefined : { scaleY: [0.55, 1, 0.55] }}
          transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Incoming-order row                                                 */
/* ------------------------------------------------------------------ */

function OrderRow({
  order,
  now,
  isDark,
  timeAgo,
  p,
  index,
}: {
  order: StreamOrder;
  now: number;
  isDark: boolean;
  timeAgo: (at: number, now: number) => string;
  p: P;
  index?: number;
}) {
  const accent = ROUND_ACCENTS[order.round - 1] ?? '#E0568F';
  return (
    <div className="flex items-center gap-2.5 py-2">
      {typeof index === 'number' && (
        <span className={`shrink-0 w-6 text-right text-[10px] tabular-nums ${isDark ? 'text-white/25' : 'text-[#160510]/30'}`}>
          {index}
        </span>
      )}
      <span
        className="shrink-0 grid place-items-center h-7 w-7 rounded-lg text-[10px] font-black"
        style={{ color: accent, background: `${accent}1f` }}
      >
        {order.round}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-[11px] truncate ${isDark ? 'text-white/85' : 'text-[#160510]/80'}`}>
            {order.hash ? shortenHash(order.hash) : shortenAddr(order.address)}
          </span>
        </div>
        {order.hash && (
          <div className={`flex items-center gap-1 text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/40'}`}>
            <span className="truncate font-mono">{shortenAddr(order.address)}</span>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] font-extrabold leading-none text-emerald-500">
          +${order.amountUsdt.toLocaleString()}
        </div>
        <div className={`mt-0.5 text-[10px] tabular-nums ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {order.d3.toLocaleString()} D3 · {timeAgo(order.at, now)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Block-explorer modal                                               */
/* ------------------------------------------------------------------ */

function OrdersExplorer({
  open,
  onClose,
  orders,
  now,
  isDark,
  lang,
  hbIndex,
  raisedUsdt,
  totalOrders,
}: {
  open: boolean;
  onClose: () => void;
  orders: StreamOrder[];
  now: number;
  isDark: boolean;
  lang: AppLang;
  hbIndex: number;
  raisedUsdt: number;
  /** True order count = real + simulated (the list itself is capped for display). */
  totalOrders: number;
}) {
  const p = usePartnerTranslation(lang);
  const timeAgo = useTimeAgo(p);
  const reduce = useReducedMotion();

  const stats = [
    { label: p('heartbeat.totalOrders'), value: totalOrders.toLocaleString() },
    { label: p('heartbeat.raised'), value: `$${Math.round(raisedUsdt).toLocaleString()}` },
    { label: p('heartbeat.title'), value: String(hbIndex), accent: true },
  ];

  return (
    <PartnerModal open={open} onClose={onClose} title={p('heartbeat.explorerTitle')} isDark={isDark}>
      {/* Live header + stats */}
      <div className="mb-3 flex items-center gap-1.5">
        <motion.span
          className="h-2 w-2 rounded-full bg-emerald-400"
          animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">{p('heartbeat.live')}</span>
        <span className={`ml-auto text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {p('heartbeat.streamHint')}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="partner-depth-inset rounded-xl p-2.5 text-center">
            <div className={`text-[9px] font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/45'}`}>{s.label}</div>
            <div className={`mt-0.5 text-base font-extrabold leading-none ${s.accent ? 'text-[#E0568F]' : isDark ? 'text-white' : 'text-[#160510]'}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Explorer list — newest prepends at the top with a flash */}
      <div className="min-h-[min(46dvh,22rem)] max-h-[min(46dvh,22rem)] overflow-y-auto pr-0.5">
        <AnimatePresence initial={false}>
          {orders.map((order, i) => (
            <motion.div
              key={order.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, backgroundColor: 'rgba(224,86,143,0.18)' }}
              animate={{ opacity: 1, backgroundColor: 'rgba(224,86,143,0)' }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className={`rounded-lg px-1.5 border-b ${isDark ? 'border-white/5' : 'border-[#160510]/5'}`}
            >
              <OrderRow order={order} now={now} isDark={isDark} timeAgo={timeAgo} p={p} index={orders.length - i} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </PartnerModal>
  );
}

/* ------------------------------------------------------------------ */
/* Main widget                                                        */
/* ------------------------------------------------------------------ */

/**
 * 私募心跳指数 — a live activity widget for the private sale. It shows a scrolling
 * ECG heartbeat, the round-1 price (800万 D3 @ 5U) + a rising-price indicator, a
 * fill bar, and a stream of incoming staking orders. Tapping it opens a
 * block-explorer-style list of every order received.
 *
 * Data comes from the server `GET /union/heartbeat` (see getHeartbeat): real
 * staked totals (stake_intents) + cumulative simulated orders (heartbeat_orders),
 * combined. 质押数量 = (real + simulated USDT) ÷ round-1 price. Polls periodically
 * to pick up newly-accrued orders; the ECG/index animation stays client-side.
 */
export function PrivateSaleHeartbeat({ lang, isDark }: { lang: AppLang; isDark: boolean }) {
  const p = usePartnerTranslation(lang);
  const timeAgo = useTimeAgo(p);
  const reduce = useReducedMotion();

  const [data, setData] = useState<HeartbeatData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hbIndex, setHbIndex] = useState(108);
  const [pulseKey, setPulseKey] = useState(0);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const lastCountRef = useRef(0);

  // Round 1 is the headline (800万 D3 @ 5U); progress fills toward its supply.
  const round = 1;
  const target = PRESALE_ROUNDS[0].d3;
  const orders = useMemo(() => (data ? toStreamOrders(data.orders) : []), [data]);
  const soldD3 = data?.stats.totalD3 ?? 0;
  const raisedUsdt = data?.stats.totalUsdt ?? 0;
  const fillPct = target > 0 ? Math.min(99.5, (soldD3 / target) * 100) : 0;
  const sold = Math.round(soldD3);
  const topOrders = orders.slice(0, 3);

  // Fetch + poll the combined real+simulated heartbeat data. When the order count
  // grows (a new cumulative order accrued), flare the ECG + bump the index.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getHeartbeat()
        .then((d) => {
          if (cancelled) return;
          setData(d);
          const total = d.stats.realCount + d.stats.addedCount;
          if (lastCountRef.current && total > lastCountRef.current) {
            setHbIndex((v) => Math.min(168, v + 10 + Math.floor(Math.random() * 8)));
            setPulseKey((k) => k + 1);
          }
          lastCountRef.current = total;
        })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 1s tick: age timestamps + let the heartbeat index breathe around its baseline.
  useEffect(() => {
    let beat = 0;
    const id = setInterval(() => {
      setNow(Date.now());
      beat += 1;
      setHbIndex((v) => {
        const breath = beat % 5 === 0 ? 2 + Math.floor(Math.random() * 4) : 0;
        return Math.max(106, Math.min(168, v - 1 + breath));
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setExplorerOpen(true)}
        style={{
          boxShadow: isDark
            ? '0 0 0 1.5px rgba(224,86,143,0.42), 0 1px 0 rgba(255,255,255,0.07) inset, 0 18px 38px -12px rgba(0,0,0,0.62)'
            : '0 0 0 1.5px rgba(224,86,143,0.45), 0 1px 0 rgba(255,255,255,0.92) inset, 0 20px 40px -14px rgba(138,43,87,0.34)',
        }}
        className={`partner-elevated-card w-full p-4 text-left ios-glass-pressable ${glassCardClass('highlight', '')}`}
      >
        <span className="ios-glass-sheen pointer-events-none" aria-hidden />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A2B57] via-[#B23A6E] to-[#E0568F]" />

        {/* Header: title + live index */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <motion.span
              className="grid place-items-center h-8 w-8 rounded-xl bg-[#E0568F]/12 text-[#E0568F]"
              animate={reduce ? undefined : { scale: [1, 1.16, 1, 1.1, 1] }}
              transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut', times: [0, 0.16, 0.32, 0.46, 1] }}
            >
              <Activity size={17} strokeWidth={2.5} />
            </motion.span>
            <div className="min-w-0">
              <div className={`text-sm font-extrabold leading-tight ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                {p('heartbeat.title')}
              </div>
              <div className={`text-[10px] ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
                {p('heartbeat.subtitle')}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-baseline justify-end gap-1 text-[#E0568F]">
              <NumberFlow value={hbIndex} className="text-2xl font-black leading-none" willChange />
            </div>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <Radio size={9} className="text-emerald-500" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">{p('heartbeat.live')}</span>
            </div>
          </div>
        </div>

        {/* ECG trace */}
        <div className="relative mt-2">
          <EcgTrace pulseKey={pulseKey} reduce={reduce} />
        </div>

        {/* Round 1 supply + price (prominent); later rounds are a dimmed "prices rise"
            indicator that beats on the same tempo as the heartbeat index. */}
        <div
          className={`relative mt-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border-[1.5px] ${
            isDark ? 'border-[#E0568F]/30 bg-[#E0568F]/[0.07]' : 'border-[#E0568F]/35 bg-[#E0568F]/[0.06]'
          }`}
        >
          <div className="min-w-0">
            <div className={`text-[10px] font-semibold ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
              {p('privateSale.roundLabel', { n: 1 })} · {PRESALE_ROUNDS[0].d3.toLocaleString()} D3
            </div>
            <div className="mt-0.5 flex items-baseline gap-0.5 leading-none">
              <span className="text-2xl font-black text-[#E0568F]">{PRESALE_ROUNDS[0].priceUsdt}</span>
              <span className="text-sm font-bold text-[#E0568F] opacity-70">U</span>
            </div>
          </div>
          <motion.div
            className="flex items-center gap-2 opacity-60"
            animate={reduce ? undefined : { scale: [1, 1.07, 1, 1.04, 1] }}
            transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut', times: [0, 0.16, 0.32, 0.46, 1] }}
          >
            <RisingBars reduce={reduce} />
            <div className="text-right leading-tight">
              <div className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#E0568F]">
                <TrendingUp size={12} strokeWidth={2.5} />
                {p('heartbeat.priceRising')}
              </div>
              <div className={`text-[9px] ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
                {p('heartbeat.priceRisingHint')}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Slowly-filling progress bar */}
        <div className="relative mt-3">
          <div className={`mb-1 flex items-center justify-between text-[10px] ${isDark ? 'text-white/50' : 'text-[#160510]/55'}`}>
            <span className="font-semibold">{p('privateSale.progressLabel', { n: round })}</span>
            <span className="tabular-nums font-bold text-[#E0568F]">
              <NumberFlow value={Math.round(fillPct * 10) / 10} willChange />%
            </span>
          </div>
          <div className="relative h-2 rounded-full overflow-hidden partner-depth-inset">
            <div
              className="h-full rounded-full transition-[width] duration-[1600ms] ease-out"
              style={{ width: `${fillPct}%`, background: 'linear-gradient(90deg, #8A2B57, #B23A6E, #E0568F)' }}
            />
            {!reduce && (
              <motion.div
                className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                animate={{ x: ['-4rem', '18rem'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
              />
            )}
          </div>
          <div className={`mt-1 text-[10px] tabular-nums ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {p('privateSale.soldOfTarget', { sold: sold.toLocaleString(), target: target.toLocaleString() })}
          </div>
        </div>

        {/* Live incoming orders (top 3) */}
        <div className="relative mt-3">
          <div className={`mb-0.5 flex items-center justify-between text-[10px] font-semibold ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
            <span>{p('heartbeat.incoming')}</span>
            <span className="flex items-center gap-0.5 text-[#E0568F]">
              {p('heartbeat.viewAll')}
              <ChevronRight size={12} />
            </span>
          </div>
          <div className={`divide-y ${isDark ? 'divide-white/5' : 'divide-[#160510]/5'}`}>
            <AnimatePresence initial={false}>
              {topOrders.map((order) => (
                <motion.div
                  key={order.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, height: 0, backgroundColor: 'rgba(224,86,143,0.16)' }}
                  animate={{ opacity: 1, height: 'auto', backgroundColor: 'rgba(224,86,143,0)' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="overflow-hidden rounded-md px-1"
                >
                  <OrderRow order={order} now={now} isDark={isDark} timeAgo={timeAgo} p={p} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </button>

      <OrdersExplorer
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        orders={orders}
        now={now}
        isDark={isDark}
        lang={lang}
        hbIndex={hbIndex}
        raisedUsdt={raisedUsdt}
        totalOrders={(data?.stats.realCount ?? 0) + (data?.stats.addedCount ?? 0)}
      />
    </>
  );
}
