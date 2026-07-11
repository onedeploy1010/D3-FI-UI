import { useEffect, useState } from 'react';
import { PageShell } from './page-shell';
import { adminFetch } from '@/lib/adminApi';
import { shortAddr, fmtUsd } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function StakesPage() {
  const [usdtRows, setUsdtRows] = useState<Array<Record<string, unknown>>>([]);
  const [sd3Rows, setSd3Rows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminFetch<{ ok: boolean; rows: Array<Record<string, unknown>> }>('/stakes?kind=usdt'),
      adminFetch<{ ok: boolean; rows: Array<Record<string, unknown>>; note?: string }>('/stakes?kind=sd3'),
    ])
      .then(([usdt, sd3]) => {
        setUsdtRows(usdt.rows);
        setSd3Rows(sd3.rows);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="质押管理" subtitle="区分链上 USDT 质押与 sD3 相关记录">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <Tabs defaultValue="usdt">
          <TabsList>
            <TabsTrigger value="usdt">USDT 质押</TabsTrigger>
            <TabsTrigger value="sd3">sD3 转账/质押</TabsTrigger>
          </TabsList>
          <TabsContent value="usdt" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              众筹 USDT / 入盟金，数据来自 partner_stake_positions
            </p>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>钱包</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>本金 USDT</TableHead>
                    <TableHead>日息</TableHead>
                    <TableHead>开始</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usdtRows.map((r) => (
                    <TableRow key={String(r.id)}>
                      <TableCell className="font-mono text-xs">{shortAddr(String(r.wallet_address))}</TableCell>
                      <TableCell>{String(r.kind)}</TableCell>
                      <TableCell>${fmtUsd(Number(r.principal_usdt))}</TableCell>
                      <TableCell>${fmtUsd(Number(r.daily_yield_usdt), 4)}</TableCell>
                      <TableCell className="text-xs">{String(r.started_at).slice(0, 10)}</TableCell>
                      <TableCell>{String(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="sd3" className="mt-4">
            <p className="text-xs text-muted-foreground mb-3">
              sD3 通过伞下转账参与众筹；完整 sD3 质押账本待客户端同步后可扩展独立表
            </p>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>转出</TableHead>
                    <TableHead>转入</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sd3Rows.map((r) => (
                    <TableRow key={String(r.id)}>
                      <TableCell className="font-mono text-xs">{shortAddr(String(r.from_wallet))}</TableCell>
                      <TableCell className="font-mono text-xs">{shortAddr(String(r.to_wallet))}</TableCell>
                      <TableCell>{fmtUsd(Number(r.amount_sd3), 4)} sD3</TableCell>
                      <TableCell>{String(r.status)}</TableCell>
                      <TableCell className="text-xs">{String(r.created_at).slice(0, 19)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}
