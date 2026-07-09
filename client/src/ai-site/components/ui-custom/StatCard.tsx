import { ReactNode } from "react";
import { cn } from "@ai/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
  accent?: boolean;
}

export function StatCard({ title, value, subtitle, icon, trend, className, accent }: StatCardProps) {
  const trendPositive = trend && trend.value > 0;
  const trendNegative = trend && trend.value < 0;

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-4 overflow-hidden card-inner transition-all duration-200",
        accent
          ? "card-accent"
          : "border-border/60 hover:border-border",
        className
      )}
    >
      {/* Subtle top gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

      <div className="relative flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest leading-none">
            {title}
          </span>
          {icon && (
            <div className={cn(
              "h-7 w-7 rounded-lg flex items-center justify-center",
              accent ? "bg-primary/15" : "bg-muted/80"
            )}>
              {icon}
            </div>
          )}
        </div>

        {/* Value — Cormorant Garamond for numbers */}
        <div className="font-stat-lg stat-value text-[1.75rem] tracking-tight leading-none text-foreground">
          {value}
        </div>

        {/* Footer row */}
        {(trend || subtitle) && (
          <div className="flex items-center gap-2 mt-0.5">
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-[11px] font-semibold",
                trendPositive ? "text-emerald-400" : trendNegative ? "text-red-400" : "text-muted-foreground"
              )}>
                {trendPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : trendNegative ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                <span className="font-mono">
                  {trendPositive ? "+" : ""}{trend.value.toFixed(1)}%
                </span>
                <span className="text-muted-foreground font-normal">{trend.label}</span>
              </div>
            )}
            {subtitle && !trend && (
              <span className="text-[11px] text-muted-foreground">{subtitle}</span>
            )}
            {subtitle && trend && (
              <span className="text-[11px] text-muted-foreground/60">· {subtitle}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
