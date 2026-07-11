import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useCallback } from "react";

/**
 * Tri-state sort header — click cycles through asc → desc → none. Header
 * stays a clickable area; the icon flips and brightens to indicate the
 * active column.
 */

export type SortDir = "asc" | "desc" | null;

export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

export function useSortState<K extends string>(initial: SortState<K> = { key: null, dir: null }) {
  // Light wrapper around the SortState shape so pages can pass a single
  // `sort` object around instead of two state hooks.
  const reset = (k: K | null = null) => ({ key: k, dir: null as SortDir });
  return { initial, reset };
}

export function nextSortDir(current: SortDir): SortDir {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

interface Props<K extends string> {
  columnKey: K;
  current: SortState<K>;
  onChange: (next: SortState<K>) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}

export function SortHeader<K extends string>({ columnKey, current, onChange, align = "left", children }: Props<K>) {
  const isActive = current.key === columnKey;
  const dir: SortDir = isActive ? current.dir : null;
  const click = useCallback(() => {
    const next = nextSortDir(dir);
    if (next === null) onChange({ key: null, dir: null });
    else onChange({ key: columnKey, dir: next });
  }, [dir, columnKey, onChange]);

  return (
    <button
      type="button"
      onClick={click}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        align === "right" ? "flex-row-reverse" : ""
      } ${isActive ? "text-primary" : ""}`}
    >
      <span>{children}</span>
      {dir === "asc" && <ChevronUp className="h-3.5 w-3.5" />}
      {dir === "desc" && <ChevronDown className="h-3.5 w-3.5" />}
      {dir === null && <ChevronsUpDown className="h-3 w-3 opacity-50" />}
    </button>
  );
}

/**
 * Generic comparator builder. Pass an accessor that maps row → value;
 * comparable types include string, number, bigint, Date. Falsy values
 * (null/undefined) sort last regardless of direction.
 */
export function compareBy<T>(
  accessor: (r: T) => string | number | bigint | Date | null | undefined,
  dir: SortDir,
): (a: T, b: T) => number {
  const sign = dir === "desc" ? -1 : 1;
  return (a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "bigint" || typeof vb === "bigint") {
      const ba = BigInt(va as any);
      const bb = BigInt(vb as any);
      return ba === bb ? 0 : ba > bb ? sign : -sign;
    }
    if (va instanceof Date || vb instanceof Date) {
      const ta = va instanceof Date ? va.getTime() : new Date(va as any).getTime();
      const tb = vb instanceof Date ? vb.getTime() : new Date(vb as any).getTime();
      return (ta - tb) * sign;
    }
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * sign;
    }
    return String(va).localeCompare(String(vb)) * sign;
  };
}
