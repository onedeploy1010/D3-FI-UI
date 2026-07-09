import { cn } from "@ai/lib/utils";
import { formatPercent, formatCurrency } from "@ai/lib/format";

interface PnlBadgeProps {
  value: number | null | undefined;
  type?: "currency" | "percent";
  className?: string;
  showIcon?: boolean;
}

export function PnlBadge({ value, type = "percent", className, showIcon = true }: PnlBadgeProps) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  
  const isPositive = value > 0;
  const isNegative = value < 0;
  const formattedValue = type === "percent" ? formatPercent(value) : formatCurrency(value);

  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-mono text-sm font-medium",
      isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground",
      className
    )}>
      {showIcon && (isPositive ? "↑" : isNegative ? "↓" : "")}
      {formattedValue}
    </span>
  );
}
