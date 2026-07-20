import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Search, ChevronDown, Inbox } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  SortHeader,
  compareBy,
  DateRangeFilter,
  EMPTY_RANGE,
  isInRange,
  type DateRange,
  type SortState,
} from '@/components/list-toolkit';
import { cn } from '@/lib/utils';

export interface DataListColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
  /** Hide this column in the small-screen stacked card view. */
  mobileHide?: boolean;
}

export interface DataListFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface DataListProps<T> {
  columns: DataListColumn<T>[];
  rows: T[];
  getRowId: (r: T) => string;
  searchKeys?: (keyof T | string)[];
  searchPlaceholder?: string;
  filters?: DataListFilter[];
  /** Field holding a timestamp; enables the date-range filter when set. */
  dateKey?: string;
  renderExpanded?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  loading?: boolean;
  emptyText?: string;
  toolbarRight?: ReactNode;
}

const ALL = '__all__';

function getField<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function displayValue(v: unknown): ReactNode {
  if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
  return String(v);
}

export function DataList<T>({
  columns,
  rows,
  getRowId,
  searchKeys,
  searchPlaceholder = '搜索…',
  filters,
  dateKey,
  renderExpanded,
  onRowClick,
  pageSize = 20,
  loading = false,
  emptyText = '暂无数据',
  toolbarRight,
}: DataListProps<T>) {
  const [query, setQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [sort, setSort] = useState<SortState<string>>({ key: null, dir: null });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const expandable = Boolean(renderExpanded);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;

    if (q && searchKeys?.length) {
      out = out.filter((row) =>
        searchKeys.some((k) => String(getField(row, String(k)) ?? '').toLowerCase().includes(q)),
      );
    }

    if (filters?.length) {
      for (const f of filters) {
        const val = filterValues[f.key];
        if (val && val !== ALL) {
          out = out.filter((row) => String(getField(row, f.key) ?? '') === val);
        }
      }
    }

    if (dateKey && (range.from || range.to)) {
      out = out.filter((row) => isInRange(getField(row, dateKey) as string, range));
    }

    if (sort.key && sort.dir) {
      const cmp = compareBy<T>((row) => {
        const v = getField(row, sort.key as string);
        return v as string | number | null | undefined;
      }, sort.dir);
      out = [...out].sort(cmp);
    }

    return out;
  }, [rows, query, searchKeys, filters, filterValues, dateKey, range, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  // Reset to first page whenever the result set changes shape.
  const resetPage = () => setPage(1);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const colCount = columns.length + (expandable ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-background/85 px-3 py-2.5 backdrop-blur">
        {searchKeys?.length ? (
          <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg cell-inset pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary/60"
            />
          </div>
        ) : null}

        {filters?.map((f) => (
          <Select
            key={f.key}
            value={filterValues[f.key] ?? ALL}
            onValueChange={(v) => {
              setFilterValues((prev) => ({ ...prev, [f.key]: v }));
              resetPage();
            }}
          >
            <SelectTrigger className="h-9 w-auto min-w-[120px] gap-1 text-xs">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{f.label}：全部</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {dateKey && (
          <DateRangeFilter
            value={range}
            onChange={(v) => {
              setRange(v);
              resetPage();
            }}
          />
        )}

        {toolbarRight && <div className="ml-auto flex items-center gap-2">{toolbarRight}</div>}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl cell-inset px-6 py-14 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border/60 md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/30 hover:bg-muted/30">
                  {expandable && <TableHead className="w-10" />}
                  {columns.map((c) => (
                    <TableHead key={c.key} className={cn('whitespace-nowrap', c.className)}>
                      {c.sortable ? (
                        <SortHeader
                          columnKey={c.key}
                          current={sort}
                          onChange={(next) => {
                            setSort(next);
                            resetPage();
                          }}
                        >
                          {c.label}
                        </SortHeader>
                      ) : (
                        c.label
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const id = getRowId(row);
                  const isOpen = expanded.has(id);
                  return (
                    <Fragment key={id}>
                      <TableRow
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={cn(
                          'border-border/40',
                          onRowClick && 'cursor-pointer',
                          isOpen && 'bg-muted/40 hover:bg-muted/40',
                        )}
                      >
                        {expandable && (
                          <TableCell className="w-10 pr-0">
                            <button
                              type="button"
                              aria-label={isOpen ? '收起' : '展开'}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(id);
                              }}
                              className="tap-target rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                            >
                              <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                            </button>
                          </TableCell>
                        )}
                        {columns.map((c) => (
                          <TableCell key={c.key} className={cn('align-middle', c.className)}>
                            {c.render ? c.render(row) : displayValue(getField(row, c.key))}
                          </TableCell>
                        ))}
                      </TableRow>
                      {expandable && isOpen && (
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableCell colSpan={colCount} className="bg-muted/25 p-3">
                            <div className="overflow-x-auto rounded-lg">{renderExpanded?.(row)}</div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-2 md:hidden">
            {pageRows.map((row) => {
              const id = getRowId(row);
              const isOpen = expanded.has(id);
              return (
                <div
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'rounded-xl cell-inset p-3 transition-colors',
                    onRowClick && 'cursor-pointer active:brightness-110',
                    isOpen && 'border-primary/40 ring-1 ring-primary/30',
                  )}
                >
                  <div className="space-y-2">
                    {columns
                      .filter((c) => !c.mobileHide)
                      .map((c) => (
                        <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {c.label}
                          </span>
                          <span className="min-w-0 break-words text-right font-medium text-foreground">
                            {c.render ? c.render(row) : displayValue(getField(row, c.key))}
                          </span>
                        </div>
                      ))}
                  </div>
                  {expandable && (
                    <div className="mt-2.5 border-t border-border/50 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(id);
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        详情
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                      </button>
                      {isOpen && <div className="mt-2 overflow-x-auto">{renderExpanded?.(row)}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: count + pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              共 {filtered.length} 条 · 第 {safePage}/{totalPages} 页
            </p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      上一页
                    </Button>
                  </PaginationItem>
                  {pageWindow(safePage, totalPages).map((p, i) =>
                    p === -1 ? (
                      <PaginationItem key={`gap-${i}`}>
                        <span className="px-2 text-muted-foreground">…</span>
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === safePage}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(p);
                          }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Compact page-number window with ellipsis sentinels (-1). */
function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push(-1);
    out.push(p);
    prev = p;
  }
  return out;
}
