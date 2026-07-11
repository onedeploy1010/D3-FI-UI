import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { adminFetch } from '@/lib/adminApi';
import { shortAddr, fmtUsd } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type RefRow = {
  wallet_address: string;
  sponsor_wallet_address: string | null;
  referred_at: string;
  status: string;
  performance_weight: number;
  referral_type: string;
};

export default function ReferralsPage() {
  const [rows, setRows] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void adminFetch<{ ok: boolean; rows: RefRow[] }>('/referrals?limit=200')
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="推荐管理" subtitle="合伙人推荐绑定与业绩权重">
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
                <TableHead>会员</TableHead>
                <TableHead>推荐人</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>业绩权重</TableHead>
                <TableHead>绑定时间</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.wallet_address + r.referred_at}>
                  <TableCell className="font-mono text-xs">{shortAddr(r.wallet_address)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.sponsor_wallet_address ? shortAddr(r.sponsor_wallet_address) : '—'}
                  </TableCell>
                  <TableCell>{r.referral_type}</TableCell>
                  <TableCell>${fmtUsd(r.performance_weight)}</TableCell>
                  <TableCell className="text-xs">{r.referred_at?.slice(0, 10)}</TableCell>
                  <TableCell>{r.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
