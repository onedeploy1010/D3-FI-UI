import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type GlassVariant = 'default' | 'highlight' | 'green' | 'accent';

const variantClass: Record<GlassVariant, string> = {
  default: 'ios-glass-card',
  highlight: 'ios-glass-card ios-glass-highlight',
  green: 'ios-glass-card ios-glass-green',
  accent: 'ios-glass-card ios-glass-accent',
};

export function glassCardClass(variant: GlassVariant = 'default', extra?: string) {
  return cn(variantClass[variant], extra);
}

export function GlassCard({
  children,
  className,
  variant = 'default',
  onClick,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: GlassVariant; children: ReactNode }) {
  const interactive = Boolean(onClick);
  return (
    <div
      {...props}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={cn(
        variantClass[variant],
        interactive && 'ios-glass-pressable cursor-pointer',
        className,
      )}
    >
      <span className="ios-glass-sheen pointer-events-none" aria-hidden />
      {children}
    </div>
  );
}

export function GlassChip({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('ios-glass-chip', className)}>
      {children}
    </div>
  );
}

export function GlassButton({
  children,
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'success' }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'ios-glass-btn',
        variant === 'primary' && 'ios-glass-btn-primary',
        variant === 'secondary' && 'ios-glass-btn-secondary',
        variant === 'ghost' && 'ios-glass-btn-ghost',
        variant === 'success' && 'ios-glass-btn-success',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GlassIconButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={cn('ios-glass-icon-btn', className)}>
      {children}
    </button>
  );
}
