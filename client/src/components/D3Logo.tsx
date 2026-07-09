/**
 * D³ Finance Logo — SVG mark (transparent), PNG optional fallback
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { brandLogo } from '@/brand';

type LogoVariant = 'svg' | 'light' | 'primary' | 'crimson' | 'mono';

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

const SVG_MARK = '/brand/logo/D3-logo-mark.svg';

function pngSrc(variant: Exclude<LogoVariant, 'svg'>) {
  if (variant === 'light') return { src: brandLogo.light, srcSet: `${brandLogo.light} 1x, ${brandLogo.light2x} 2x` };
  return { src: brandLogo[variant], srcSet: undefined };
}

export function D3LogoMark({
  size = 46,
  className = '',
  variant = 'svg',
}: {
  size?: number;
  className?: string;
  animated?: boolean;
  variant?: LogoVariant;
}) {
  const [pngFailed, setPngFailed] = useState(false);
  const useSvg = variant === 'svg' || pngFailed;

  if (useSvg) {
    return (
      <img
        src={SVG_MARK}
        alt="D³ Finance"
        width={size}
        height={size}
        className={`object-contain shrink-0 ${className}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }

  const { src, srcSet } = pngSrc(variant);

  return (
    <img
      src={src}
      srcSet={srcSet}
      alt="D³ Finance"
      width={size}
      height={size}
      onError={() => setPngFailed(true)}
      className={`object-contain shrink-0 ${className} ${
        variant === 'light' ? 'mix-blend-multiply dark:mix-blend-normal' : ''
      }`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function D3Logo({
  size = 46,
  className = '',
  showText = false,
  textClassName = '',
  to,
  variant = 'svg',
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
