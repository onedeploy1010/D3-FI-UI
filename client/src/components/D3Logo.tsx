/**
 * D³ Finance Logo Component
 * Matches whitepaper VI: burgundy circle + white serif italic D³
 * Animation: two faint D's spread left/right → shrink & rise → resolve into ³
 */
import { motion, useAnimation } from 'framer-motion';
import { useEffect } from 'react';
import { Link } from 'wouter';

const SERIF = "'Playfair Display', Georgia, serif";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

interface D3LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textClassName?: string;
  to?: string;
  animated?: boolean;
}

function GhostD({ controls }: { controls: ReturnType<typeof useAnimation> }) {
  return (
    <motion.g
      initial={{ opacity: 0, x: 0, y: 0, scale: 0.88 }}
      animate={controls}
      style={{ transformOrigin: '50px 62px', transformBox: 'fill-box' }}
    >
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fill="white"
        fontSize="38"
        fontFamily={SERIF}
        fontStyle="italic"
        fontWeight="600"
        opacity="0.9"
      >
        D
      </text>
    </motion.g>
  );
}

async function playLogoSequence(
  ghostLeft: ReturnType<typeof useAnimation>,
  ghostRight: ReturnType<typeof useAnimation>,
  cube: ReturnType<typeof useAnimation>,
  ring: ReturnType<typeof useAnimation>,
  subtle = false,
) {
  const spread = subtle ? 11 : 17;
  const peakOpacity = subtle ? 0.24 : 0.38;
  const spreadDur = subtle ? 0.55 : 0.8;
  const riseDur = subtle ? 0.65 : 0.9;

  ghostLeft.set({ opacity: 0, x: 0, y: 0, scale: 0.88 });
  ghostRight.set({ opacity: 0, x: 0, y: 0, scale: 0.88 });
  if (!subtle) cube.set({ opacity: 0, scale: 0.28, x: -22, y: 20 });

  // 1. 左右展开
  await Promise.all([
    ghostLeft.start({
      opacity: peakOpacity,
      x: -spread,
      y: 0,
      scale: 1,
      transition: { duration: spreadDur, ease: EASE_OUT },
    }),
    ghostRight.start({
      opacity: peakOpacity,
      x: spread,
      y: 0,
      scale: 1,
      transition: { duration: spreadDur, ease: EASE_OUT },
    }),
  ]);

  // 2. 变小往上
  await Promise.all([
    ghostLeft.start({
      opacity: peakOpacity * 0.55,
      x: 20,
      y: -24,
      scale: 0.38,
      transition: { duration: riseDur, ease: 'easeInOut' },
    }),
    ghostRight.start({
      opacity: peakOpacity * 0.55,
      x: 20,
      y: -24,
      scale: 0.38,
      transition: { duration: riseDur, ease: 'easeInOut' },
    }),
    ring.start({
      strokeOpacity: subtle ? 0.52 : 0.68,
      transition: { duration: riseDur * 0.8, ease: 'easeOut' },
    }),
  ]);

  // 3. 虚影消失，³ 出现
  await Promise.all([
    ghostLeft.start({ opacity: 0, transition: { duration: 0.22 } }),
    ghostRight.start({ opacity: 0, transition: { duration: 0.22 } }),
    cube.start({
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
      transition: { duration: subtle ? 0.45 : 0.6, ease: EASE_SPRING },
    }),
  ]);

  ring.start({ strokeOpacity: 0.4, transition: { duration: 0.7, ease: 'easeOut' } });
}

export function D3LogoMark({
  size = 38,
  className = '',
  animated = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const ghostLeft = useAnimation();
  const ghostRight = useAnimation();
  const cube = useAnimation();
  const ring = useAnimation();

  useEffect(() => {
    if (!animated) {
      cube.set({ opacity: 1, scale: 1, x: 0, y: 0 });
      return;
    }

    let cancelled = false;

    async function run() {
      await playLogoSequence(ghostLeft, ghostRight, cube, ring, false);
      if (cancelled) return;

      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 5600));
        if (cancelled) break;
        await playLogoSequence(ghostLeft, ghostRight, cube, ring, true);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [animated, ghostLeft, ghostRight, cube, ring]);

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="50" cy="50" r="48" fill="#6B1A3A" />
      <motion.circle
        cx="50"
        cy="50"
        r="46"
        stroke="#C9A96E"
        strokeWidth="0.8"
        fill="none"
        initial={{ strokeOpacity: 0.4 }}
        animate={ring}
      />

      {animated && (
        <>
          <GhostD controls={ghostLeft} />
          <GhostD controls={ghostRight} />
        </>
      )}

      <text
        x="50"
        y="62"
        textAnchor="middle"
        fill="white"
        fontSize="42"
        fontFamily={SERIF}
        fontStyle="italic"
        fontWeight="700"
      >
        D
      </text>

      <motion.g
        initial={animated ? { opacity: 0, scale: 0.28, x: -22, y: 20 } : false}
        animate={cube}
        style={{ transformOrigin: '72px 42px', transformBox: 'fill-box' }}
      >
        <text
          x="72"
          y="42"
          textAnchor="middle"
          fill="white"
          fontSize="20"
          fontFamily={SERIF}
          fontStyle="italic"
          fontWeight="600"
        >
          ³
        </text>
      </motion.g>
    </motion.svg>
  );
}

export function D3Logo({
  size = 38,
  className = '',
  showText = false,
  textClassName = '',
  to,
  animated = true,
}: D3LogoProps) {
  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <D3LogoMark size={size} animated={animated} />

      {showText && (
        <span
          className={`hidden sm:inline font-heading font-bold tracking-tight text-[0.85em] uppercase tracking-[0.15em] ${textClassName}`}
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Finance
        </span>
      )}
    </div>
  );

  if (!to) return content;

  return (
    <Link
      href={to}
      className="inline-flex transition-opacity hover:opacity-85"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="D³ Finance Home"
    >
      {content}
    </Link>
  );
}
