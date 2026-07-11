import { Calendar, X } from "lucide-react";
import { useState } from "react";

/**
 * Compact `[from] – [to]` date range picker. Both inputs are optional —
 * empty `from` means "no lower bound", empty `to` means "no upper bound".
 * Quick-select chips (今日 / 7天 / 30天) cover the common cases without
 * making admins type a date.
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
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
          active
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card"
        }`}
      >
        <Calendar className="h-3.5 w-3.5" />
        {active
          ? `${value.from ?? "起始"} → ${value.to ?? "至今"}`
          : label}
        {active && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(EMPTY_RANGE); }}
            className="ml-1 hover:text-red-400"
            role="button"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-2 w-72 rounded-xl border border-border/80 bg-background shadow-2xl p-3 right-0 sm:left-0 sm:right-auto">
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {[
                { label: "今日",  v: { from: todayISO(),    to: todayISO() } },
                { label: "近 7 天",  v: { from: daysAgoISO(6), to: todayISO() } },
                { label: "近 30 天", v: { from: daysAgoISO(29), to: todayISO() } },
                { label: "本月",  v: { from: monthStartISO(),    to: todayISO() } },
                { label: "清除",  v: EMPTY_RANGE },
              ].map((q) => (
                <button
                  key={q.label}
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
                onClick={() => { onChange(EMPTY_RANGE); setOpen(false); }}
                className="px-2 py-1 text-[11px] rounded border border-border hover:bg-muted/30"
              >清除</button>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 text-[11px] rounded bg-primary text-primary-foreground"
              >确定</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
