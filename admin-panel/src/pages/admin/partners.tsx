import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { MemberDetailDialog } from '@/components/member-detail-dialog';
import { adminFetch } from '@/lib/adminApi';
import { shortAddr, fmtUsd } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PartnerRow = {
  wallet_address: string;
  sd3_balance: number;
  pending_usdt_yield: number;
  market_leader_status: string;
  joined_at: string;
  teamStats?: {
    teamPerformanceUsd: number;
    dailyNewPerformanceUsd: number;
    personalPerformanceUsd: number;
  };
};

export default function PartnersPage() {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<{ ok: boolean; rows: PartnerRow[] }>('/partners?limit=200')
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="合伙人管理" subtitle="已入盟合伙人、市场领袖与业绩">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>钱包</TableHead>
                <TableHead>入盟</TableHead>
                <TableHead>伞下业绩</TableHead>
                <TableHead>日新增</TableHead>
                <TableHead>市场领袖</TableHead>
                <TableHead>sD3</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.wallet_address}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetail(r.wallet_address)}
                >
                  <TableCell className="font-mono text-xs">{shortAddr(r.wallet_address)}</TableCell>
                  <TableCell className="text-xs">{r.joined_at?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>${fmtUsd(r.teamStats?.teamPerformanceUsd ?? 0)}</TableCell>
                  <TableCell>${fmtUsd(r.teamStats?.dailyNewPerformanceUsd ?? 0)}</TableCell>
                  <TableCell>
                    <Badge variant={r.market_leader_status === 'approved' ? 'default' : 'secondary'}>
                      {r.market_leader_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtUsd(r.sd3_balance, 4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <MemberDetailDialog wallet={detail} onClose={() => setDetail(null)} />
    </PageShell>
  );
}
