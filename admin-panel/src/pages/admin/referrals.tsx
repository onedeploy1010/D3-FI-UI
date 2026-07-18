import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Network, List as ListIcon, X } from 'lucide-react';
import { PageShell } from './page-shell';
import { adminFetch } from '@/lib/adminApi';
import { ReferralTree } from '@/components/referral-tree';
import { DataList, type DataListColumn } from '@/components/data-list';
import { AddressChip } from '@/components/address-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type RefRow = {
  wallet_address: string;
  sponsor_wallet_address: string | null;
  referred_at: string;
  status: string;
  performance_weight: number;
  referral_type: string;
};

/** Pick a sensible default tree root: the sponsor with the most direct
 *  referrals who is not themselves referred by anyone in the set (a true
 *  top-of-tree). Falls back to the most-referenced sponsor overall. */
function pickDefaultRoot(rows: RefRow[]): string | null {
  const directCount = new Map<string, number>();
  const isReferred = new Set<string>();
  for (const r of rows) {
    isReferred.add(r.wallet_address.toLowerCase());
    if (r.sponsor_wallet_address) {
      const s = r.sponsor_wallet_address;
      directCount.set(s, (directCount.get(s) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestN = -1;
  let bestTop: string | null = null;
  let bestTopN = -1;
  for (const [wallet, n] of directCount) {
    if (n > bestN) {
      bestN = n;
      best = wallet;
    }
    if (!isReferred.has(wallet.toLowerCase()) && n > bestTopN) {
      bestTopN = n;
      bestTop = wallet;
    }
  }
  return bestTop ?? best;
}

/** Lightweight wallet combobox: type to filter known wallets, or paste any
 *  address and confirm. Mobile-first — full-width, tap-friendly rows. */
function WalletPicker({
  value,
  candidates,
  onSelect,
}: {
  value: string | null;
  candidates: string[];
  onSelect: (wallet: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? candidates.filter((w) => w.toLowerCase().includes(q)) : candidates;
    return base.slice(0, 30);
  }, [query, candidates]);

  const isRawAddress = /^0x[a-fA-F0-9]{40}$/.test(query.trim());

  function commit(wallet: string) {
    onSelect(wallet);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative w-full sm:max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isRawAddress) commit(query.trim());
          }}
          placeholder="搜索或粘贴钱包地址…"
          className="h-9 w-full rounded-lg border border-border bg-input/40 pl-8 pr-8 text-sm outline-none focus:border-primary/60"
        />
        {query && (
          <button
            type="button"
            aria-label="清除"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (query || matches.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border/70 bg-popover p-1 shadow-lg">
          {isRawAddress && (
            <button
              type="button"
              onClick={() => commit(query.trim())}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
            >
              <Network className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-mono text-xs">查看 {query.trim()}</span>
            </button>
          )}
          {matches.length === 0 && !isRawAddress ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">无匹配钱包</p>
          ) : (
            matches.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => commit(w)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60',
                  value && w.toLowerCase() === value.toLowerCase() && 'bg-muted/50',
                )}
              >
                <span className="truncate font-mono text-xs">{w}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ReferralsPage() {
  const [rows, setRows] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [rootTouched, setRootTouched] = useState(false);
  const [depth, setDepth] = useState('3');

  useEffect(() => {
    void adminFetch<{ ok: boolean; rows: RefRow[] }>('/referrals?limit=200')
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  // Default the tree root to a top sponsor once data lands (unless the admin
  // has already chosen one).
  useEffect(() => {
    if (!rootTouched && !root && rows.length > 0) {
      setRoot(pickDefaultRoot(rows));
    }
  }, [rows, root, rootTouched]);

  // Every distinct wallet (members + sponsors) that can seed the tree.
  const candidateWallets = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.wallet_address) set.add(r.wallet_address);
      if (r.sponsor_wallet_address) set.add(r.sponsor_wallet_address);
    }
    return [...set];
  }, [rows]);

  const columns: DataListColumn<RefRow>[] = [
    {
      key: 'wallet_address',
      label: '成员',
      render: (r) => <AddressChip address={r.wallet_address} variant="compact" />,
    },
    {
      key: 'sponsor_wallet_address',
      label: '推荐人',
      render: (r) =>
        r.sponsor_wallet_address ? (
          <AddressChip address={r.sponsor_wallet_address} variant="compact" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      label: '状态',
      sortable: true,
      mobileHide: true,
      render: (r) => <span className="text-xs">{r.status}</span>,
    },
    {
      key: 'referred_at',
      label: '绑定时间',
      sortable: true,
      render: (r) => <span className="text-xs text-muted-foreground">{r.referred_at?.slice(0, 10)}</span>,
    },
  ];

  return (
    <PageShell title="推荐管理" subtitle="UD3 推荐网络 · 推荐树与绑定关系">
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="tree" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="tree" className="gap-1.5">
              <Network className="h-4 w-4" />
              推荐树
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <ListIcon className="h-4 w-4" />
              列表
            </TabsTrigger>
          </TabsList>

          {/* Tree view */}
          <TabsContent value="tree" className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <WalletPicker
                value={root}
                candidates={candidateWallets}
                onSelect={(w) => {
                  setRoot(w);
                  setRootTouched(true);
                }}
              />
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger className="h-9 w-full gap-1 text-xs sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['2', '3', '4', '5'].map((d) => (
                    <SelectItem key={d} value={d}>
                      展开 {d} 层
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {root ? (
              <ReferralTree key={`${root}:${depth}`} root={root} depth={Number(depth)} />
            ) : (
              <div className="rounded-xl border border-border/60 bg-card/40 px-6 py-14 text-center">
                <Network className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">搜索或选择一个钱包以查看其推荐树</p>
              </div>
            )}
          </TabsContent>

          {/* Flat list view */}
          <TabsContent value="list">
            <DataList<RefRow>
              columns={columns}
              rows={rows}
              getRowId={(r) => `${r.wallet_address}:${r.referred_at}`}
              searchKeys={['wallet_address', 'sponsor_wallet_address']}
              searchPlaceholder="搜索成员 / 推荐人地址…"
              dateKey="referred_at"
              pageSize={20}
              emptyText="暂无推荐绑定"
            />
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}
