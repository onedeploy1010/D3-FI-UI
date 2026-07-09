/**
 * D³ Finance Logo — official seal PNGs (user-provided brand assets)
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { brandLogo } from '@/brand';
import { useTheme } from '@/contexts/ThemeContext';

type LogoVariant = 'auto' | 'svg' | 'light' | 'primary' | 'crimson' | 'mono';

interface D3LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textClassName?: string;
  to?: string;
  variant?: LogoVariant;
  /** @deprecated Brand mark is static image; kept for API compatibility */
  animated?: boolean;
}

type PngVariant = Exclude<LogoVariant, 'svg' | 'auto'>;

const PNG_2X: Record<PngVariant, string> = {
  light: brandLogo.light2x,
  primary: brandLogo.primary2x,
  crimson: brandLogo.crimson2x,
  mono: brandLogo.mono2x,
};

/** Official seal — same asset for light/dark (self-contained circular mark) */
function resolveVariant(variant: LogoVariant, _isDark: boolean): Exclude<LogoVariant, 'auto'> {
  if (variant !== 'auto') return variant;
  return 'primary';
}

function pngSrc(variant: PngVariant) {
  return {
    src: brandLogo[variant],
    srcSet: `${brandLogo[variant]} 1x, ${PNG_2X[variant]} 2x`,
  };
}

function InlineSvgMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="D³ Finance"
      className={`shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id="d3-logo-ring" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5E1A3C" />
          <stop offset="0.45" stopColor="#8A2B57" />
          <stop offset="1" stopColor="#E0568F" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" stroke="url(#d3-logo-ring)" strokeWidth="3.5" fill="none" />
      <text
        x="32"
        y="38.5"
        textAnchor="middle"
        fill="url(#d3-logo-ring)"
        fontFamily="Nunito, Varela Round, PingFang SC, sans-serif"
        fontSize="17"
        fontWeight="800"
      >
        D³
      </text>
    </svg>
  );
}

export function D3LogoMark({
  size = 46,
  className = '',
  variant = 'auto',
}: {
  size?: number;
  className?: string;
  animated?: boolean;
  variant?: LogoVariant;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const resolved = resolveVariant(variant, isDark);
  const [imgFailed, setImgFailed] = useState(false);

  if (resolved === 'svg' || imgFailed) {
    return <InlineSvgMark size={size} className={className} />;
  }

  const { src, srcSet } = pngSrc(resolved);

  return (
    <img
      src={src}
      srcSet={srcSet}
      alt="D³ Finance"
      width={size}
      height={size}
      onError={() => setImgFailed(true)}
      className={`object-contain shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
      decoding="async"
    />
  );
}

export function D3Logo({
  size = 46,
  className = '',
  showText = false,
  textClassName = '',
  to,
  variant = 'auto',
}: D3LogoProps) {
  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <D3LogoMark size={size} variant={variant} />

      {showText && (
        <span
          className={`hidden sm:inline font-display font-bold tracking-[0.12em] uppercase text-[0.9em] text-primary ${textClassName}`}
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
