import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SitePageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** page = nav bar title; content = in-page hero (D³-AI style) */
  variant?: 'page' | 'content';
  className?: string;
};

export function SitePageHeader({ title, subtitle, variant = 'page', className }: SitePageHeaderProps) {
  return (
    <div className={className}>
      <h1 className={variant === 'content' ? 'site-content-title' : 'site-page-title'}>{title}</h1>
      {subtitle != null && subtitle !== '' && (
        <p className={variant === 'content' ? 'site-content-subtitle' : 'site-page-subtitle mt-0.5'}>{subtitle}</p>
      )}
    </div>
  );
}

/** Metric block: label + value (+ optional unit) */
export function SiteStat({
  label,
  value,
  unit,
  accent = false,
  size = 'md',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  accent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const valueClass =
    size === 'lg' ? 'site-stat-value-lg' : size === 'sm' ? 'site-stat-value-sm' : 'site-stat-value-md';
  return (
    <div className={className}>
      <div className="site-stat-label mb-1">{label}</div>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className={cn(valueClass, accent && 'site-stat-value-accent')}>{value}</span>
        {unit != null && unit !== '' && <span className="site-stat-label">{unit}</span>}
      </div>
    </div>
  );
}
