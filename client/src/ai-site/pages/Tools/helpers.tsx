import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function useShowZh() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("zh") ?? true;
}

export const TS = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

export function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(d)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(d)}K`;
  return n.toFixed(d);
}

export function ToolHeader({ icon, title, titleZh, desc, descZh }: {
  icon: ReactNode; title: string; titleZh: string; desc: string; descZh: string;
}) {
  const showZh = useShowZh();
  return (
    <div className="flex items-start gap-3 mb-6 pb-5 border-b border-border/50">
      <div className="p-2 rounded-lg bg-muted/30 border border-border/50 mt-0.5">{icon}</div>
      <div>
        <h2 className="text-lg sm:text-xl font-semibold flex flex-wrap items-baseline gap-2">
          {title}{showZh && <span className="text-base font-normal text-muted-foreground">{titleZh}</span>}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}{showZh && <span className="hidden sm:inline"> · {descZh}</span>}</p>
      </div>
    </div>
  );
}

export function ParamsCard({ title, titleZh, children }: { title: string; titleZh: string; children: ReactNode }) {
  const showZh = useShowZh();
  return (
    <Card className="bg-card border-border shadow-sm h-fit">
      <CardHeader className="pb-4 border-b border-border/50">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {title}{showZh && <span className="text-xs font-normal text-muted-foreground">{titleZh}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">{children}</CardContent>
    </Card>
  );
}

export function SliderRow({ label, labelZh, value, set, min, max, step, display }: {
  label: string; labelZh: string; value: number; set: (v: number) => void;
  min: number; max: number; step: number; display: string;
}) {
  const showZh = useShowZh();
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Label className="text-xs text-muted-foreground">{label}{showZh && <span className="opacity-60"> {labelZh}</span>}</Label>
        <span className="font-mono tabular-nums text-xs text-foreground">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={v => set(v[0])} />
    </div>
  );
}

export function KpiGrid({ items }: { items: { label: string; labelZh: string; value: string; color?: string }[] }) {
  const showZh = useShowZh();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, labelZh, value, color }) => (
        <div key={label} className="bg-card border border-border rounded-xl p-3 sm:p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 leading-tight">
            {label}
            {showZh && <><br /><span className="opacity-60">{labelZh}</span></>}
          </p>
          <p className={`text-base sm:text-lg font-mono tabular-nums mt-1 leading-tight ${color ?? "text-foreground"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, msg, sub }: { icon: ReactNode; msg: string; sub: string }) {
  const showZh = useShowZh();
  return (
    <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/20">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto">{icon}</div>
        <p className="text-sm text-muted-foreground">
          {msg}
          {showZh && <><br /><span className="text-xs opacity-70">{sub}</span></>}
        </p>
      </div>
    </div>
  );
}
