import { cn } from "@ai/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SignalBadgeProps {
  signal: "bullish" | "bearish" | "neutral" | string;
  className?: string;
  showIcon?: boolean;
}

export function SignalBadge({ signal, className, showIcon = true }: SignalBadgeProps) {
  const isBullish = signal.toLowerCase() === "bullish";
  const isBearish = signal.toLowerCase() === "bearish";
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider",
      isBullish ? "bg-green-500/10 text-green-500 border border-green-500/20" :
      isBearish ? "bg-red-500/10 text-red-500 border border-red-500/20" :
      "bg-muted text-muted-foreground border border-border",
      className
    )}>
      {showIcon && (
        isBullish ? <TrendingUp className="w-3 h-3" /> :
        isBearish ? <TrendingDown className="w-3 h-3" /> :
        <Minus className="w-3 h-3" />
      )}
      {signal}
    </span>
  );
}
