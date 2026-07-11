import { useCallback, useMemo, useState } from "react";

/**
 * Generic multi-select state for any list page. Keys identify rows
 * (typically the wallet address — lowercased — or a row id). The hook
 * returns helpers shaped for `<input type="checkbox">` cells: `isSelected`,
 * `toggle`, `toggleAll`, plus convenience derived state for `selectAll`
 * (all visible rows) and `someSelected` (mixed state for the header
 * checkbox).
 *
 * Filtering happens upstream — pass the post-filter list to `toggleAll`
 * so "select all" only flips visible rows, never hidden ones.
 */
export function useRowSelection() {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());

  const isSelected = useCallback((k: string) => keys.has(k), [keys]);

  const toggle = useCallback((k: string) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const setSelected = useCallback((k: string, on: boolean) => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(k); else next.delete(k);
      return next;
    });
  }, []);

  const toggleAll = useCallback((visibleKeys: string[]) => {
    setKeys((prev) => {
      // If every visible key is already selected, deselect them all.
      // Otherwise add every visible key. This matches the standard
      // "select all" header-checkbox UX.
      const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allOn) for (const k of visibleKeys) next.delete(k);
      else for (const k of visibleKeys) next.add(k);
      return next;
    });
  }, []);

  const clear = useCallback(() => setKeys(new Set()), []);

  const status = useCallback((visibleKeys: string[]): "none" | "some" | "all" => {
    if (visibleKeys.length === 0 || keys.size === 0) return "none";
    let on = 0;
    for (const k of visibleKeys) if (keys.has(k)) on += 1;
    if (on === 0) return "none";
    if (on === visibleKeys.length) return "all";
    return "some";
  }, [keys]);

  return useMemo(() => ({
    keys, count: keys.size, isSelected, toggle, setSelected, toggleAll, clear, status,
  }), [keys, isSelected, toggle, setSelected, toggleAll, clear, status]);
}

export type RowSelection = ReturnType<typeof useRowSelection>;
