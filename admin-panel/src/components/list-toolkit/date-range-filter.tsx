import { Calendar, X } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Compact `[from] – [to]` date range picker. Both inputs are optional —
 * empty `from` means "no lower bound", empty `to` means "no upper bound".
 * Quick-select chips (今日 / 7天 / 30天) cover the common cases without
 * making admins type a date.
 *
 * The panel renders through a Radix Popover portal. The previous
 * hand-rolled `position: fixed` panel broke inside DataList's sticky
 * toolbar: `backdrop-blur` creates a CSS containing block, so the
 * "viewport-centered" panel was centered on the ~50px toolbar instead and
 * flew off-screen (and the desktop absolute panel could overflow the
 * viewport edge). Portaling to <body> with collision detection fixes both.
 */

export interface DateRange {
  from: string | null; // ISO date "2026-04-01"
  to: string | null;
}

export const EMPTY_RANGE: DateRange = { from: null, to: null };

export function isInRange(timestamp: string | number | Date | null | undefined, r: DateRange): boolean {
  if (!timestamp) return r.from == null && r.to == null;
  const t = new Date(timestamp).getTime();
  if (r.from) {
    const lo = new Date(r.from + "T00:00:00").getTime();
    if (t < lo) return false;
  }
  if (r.to) {
    const hi = new Date(r.to + "T23:59:59.999").getTime();
    if (t > hi) return false;
  }
  return true;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** Optional shortcut to the field this range filters — e.g. "购买时间". */
  label?: string;
}

export function DateRangeFilter({ value, onChange, label = "日期" }: Props) {
  const [open, setOpen] = useState(false);
  const active = value.from != null || value.to != null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-9 items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition-all ${
            active
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {active ? `${value.from ?? "起始"} → ${value.to ?? "至今"}` : label}
          </span>
          {active && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(EMPTY_RANGE); }}
              className="ml-1 hover:text-red-400"
              role="button"
              aria-label="清除日期筛选"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border-border/80 p-3 shadow-2xl"
      >
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {[
            { label: "今日", v: { from: todayISO(), to: todayISO() } },
            { label: "近 7 天", v: { from: daysAgoISO(6), to: todayISO() } },
            { label: "近 30 天", v: { from: daysAgoISO(29), to: todayISO() } },
            { label: "本月", v: { from: monthStartISO(), to: todayISO() } },
            { label: "清除", v: EMPTY_RANGE },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => { onChange(q.v); setOpen(false); }}
              className="px-2 py-0.5 rounded text-[10px] border border-border/60 hover:border-primary/60 hover:text-primary"
            >{q.label}</button>
          ))}
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">起 (from)</span>
            <input
              type="date"
              value={value.from ?? ""}
              onChange={(e) => onChange({ ...value, from: e.target.value || null })}
              className="w-full px-2 py-1.5 bg-input border border-border rounded text-xs"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">止 (to)</span>
            <input
              type="date"
              value={value.to ?? ""}
              onChange={(e) => onChange({ ...value, to: e.target.value || null })}
              className="w-full px-2 py-1.5 bg-input border border-border rounded text-xs"
            />
          </label>
        </div>
        <div className="flex gap-1.5 mt-3 justify-end">
          <button
            type="button"
            onClick={() => { onChange(EMPTY_RANGE); setOpen(false); }}
            className="px-2 py-1 text-[11px] rounded border border-border hover:bg-muted/30"
          >清除</button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-2 py-1 text-[11px] rounded bg-primary text-primary-foreground"
          >确定</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
