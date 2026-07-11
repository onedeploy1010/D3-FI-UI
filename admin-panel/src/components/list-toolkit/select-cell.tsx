import type { RowSelection } from "./use-row-selection";

/**
 * Single-row checkbox cell. Always tap-target-safe (24px hit area on
 * mobile via the wrapping label) and stops click propagation so it
 * doesn't trigger row navigation.
 */
export function SelectCell({ k, sel }: { k: string; sel: RowSelection }) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center cursor-pointer p-1 -m-1"
    >
      <input
        type="checkbox"
        checked={sel.isSelected(k)}
        onChange={() => sel.toggle(k)}
        className="h-4 w-4 accent-primary cursor-pointer"
      />
    </label>
  );
}

/**
 * Header checkbox — tri-state: empty / mixed / all. `visibleKeys` lets
 * the caller cap "select all" to the post-filter set, so users can't
 * accidentally select hidden rows.
 */
export function SelectAllCell({ visibleKeys, sel }: { visibleKeys: string[]; sel: RowSelection }) {
  const status = sel.status(visibleKeys);
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center cursor-pointer p-1 -m-1"
      title={status === "all" ? "取消全选" : "全选可见行"}
    >
      <input
        type="checkbox"
        checked={status === "all"}
        ref={(el) => { if (el) el.indeterminate = status === "some"; }}
        onChange={() => sel.toggleAll(visibleKeys)}
        className="h-4 w-4 accent-primary cursor-pointer"
      />
    </label>
  );
}
