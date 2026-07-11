import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { MemberDetailDialog } from '@/components/member-detail-dialog';
import { adminFetch, type MemberRow } from '@/lib/adminApi';
import { shortAddr, fmtUsd } from '@/lib/supabase';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function MembersPage() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [detailWallet, setDetailWallet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    void adminFetch<{ ok: boolean; rows: MemberRow[] }>(`/members?q=${encodeURIComponent(search)}&limit=100`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <PageShell title="会员管理" subtitle="合伙人账户、业绩与资产一览">
      <div className="flex gap-2 mb-4 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索钱包地址…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive mb-4">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>钱包</TableHead>
                <TableHead>身份</TableHead>
                <TableHead>伞下业绩</TableHead>
                <TableHead>日新增</TableHead>
                <TableHead>sD3</TableHead>
                <TableHead>待提现</TableHead>
                <TableHead>推荐人</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.walletAddress}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetailWallet(row.walletAddress)}
                >
                  <TableCell className="font-mono text-xs">{shortAddr(row.walletAddress)}</TableCell>
                  <TableCell>
                    {row.isPartner ? (
                      <Badge variant="default" className="bg-[#E0568F]/20 text-[#E0568F] border-[#E0568F]/30">
                        合伙人
                      </Badge>
                    ) : (
                      <Badge variant="secondary">会员</Badge>
                    )}
                    {row.marketLeaderStatus === 'approved' && (
                      <Badge className="ml-1" variant="outline">
                        市场领袖
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>${fmtUsd(row.teamPerformanceUsd)}</TableCell>
                  <TableCell>${fmtUsd(row.dailyNewPerformanceUsd)}</TableCell>
                  <TableCell>{fmtUsd(row.sd3Balance, 4)}</TableCell>
                  <TableCell>${fmtUsd(row.pendingUsdtYield, 4)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.sponsorWallet ? shortAddr(row.sponsorWallet) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <MemberDetailDialog wallet={detailWallet} onClose={() => setDetailWallet(null)} />
    </PageShell>
  );
}
