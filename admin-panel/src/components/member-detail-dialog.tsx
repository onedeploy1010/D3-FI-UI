import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { adminFetch } from '@/lib/adminApi';
import { fmtUsd, shortAddr } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Detail = {
  account: Record<string, unknown> | null;
  referral: Record<string, unknown> | null;
  downlines: Array<Record<string, unknown>>;
  stakes: Array<Record<string, unknown>>;
  ud3Transfers: Array<Record<string, unknown>>;
  yieldWithdrawals: Array<Record<string, unknown>>;
  subsidyTickets: Array<Record<string, unknown>>;
  teamStats: {
    personalPerformanceUsd: number;
    teamPerformanceUsd: number;
    dailyNewPerformanceUsd: number;
  };
};

export function MemberDetailDialog({
  wallet,
  onClose,
}: {
  wallet: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    void adminFetch<Detail & { ok: boolean }>(`/members/${wallet}`)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [wallet]);

  const account = data?.account;

  return (
    <Dialog open={Boolean(wallet)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{wallet}</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {data && !loading && (
          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="stakes">质押</TabsTrigger>
              <TabsTrigger value="sd3">sD3 转账</TabsTrigger>
              <TabsTrigger value="withdrawals">收益提现</TabsTrigger>
              <TabsTrigger value="subsidies">补贴申请</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">身份</p>
                  <p className="font-semibold mt-1">
                    {account?.is_partner ? '合伙人' : '会员'}
                    {String(account?.market_leader_status ?? 'none') === 'approved' && ' · 市场领袖'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">入盟时间</p>
                  <p className="font-semibold mt-1">{String(account?.joined_at ?? '—')}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">个人业绩</p>
                  <p className="font-semibold mt-1">${fmtUsd(data.teamStats.personalPerformanceUsd)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">伞下业绩</p>
                  <p className="font-semibold mt-1">${fmtUsd(data.teamStats.teamPerformanceUsd)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">日新增业绩</p>
                  <p className="font-semibold mt-1">${fmtUsd(data.teamStats.dailyNewPerformanceUsd)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">资产</p>
                  <p className="mt-1 text-xs">
                    sD3 {fmtUsd(Number(account?.sd3_balance ?? 0), 4)} · 待提 $
                    {fmtUsd(Number(account?.pending_usdt_yield ?? 0), 4)}
                  </p>
                </div>
              </div>
              {data.referral && (
                <p className="text-xs text-muted-foreground">
                  推荐人：{shortAddr(String(data.referral.sponsor_wallet_address ?? ''))}
                </p>
              )}
              <div>
                <p className="text-xs font-semibold mb-2">直推 ({(data.downlines ?? []).length})</p>
                <div className="max-h-32 overflow-y-auto text-xs font-mono space-y-1">
                  {(data.downlines ?? []).map((d) => (
                    <div key={String(d.wallet_address)}>{shortAddr(String(d.wallet_address))}</div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stakes">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>本金</TableHead>
                    <TableHead>日息</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.stakes ?? []).map((s) => (
                    <TableRow key={String(s.id)}>
                      <TableCell>{String(s.kind)}</TableCell>
                      <TableCell>${fmtUsd(Number(s.principal_usdt))}</TableCell>
                      <TableCell>${fmtUsd(Number(s.daily_yield_usdt), 4)}</TableCell>
                      <TableCell>{String(s.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="sd3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>方向</TableHead>
                    <TableHead>对方</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.ud3Transfers ?? []).map((t) => {
                    const from = String(t.from_wallet).toLowerCase();
                    const isOut = wallet && from === wallet.toLowerCase();
                    return (
                      <TableRow key={String(t.id)}>
                        <TableCell>
                          <Badge variant={isOut ? 'destructive' : 'default'}>
                            {isOut ? '转出' : '转入'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {shortAddr(isOut ? String(t.to_wallet) : String(t.from_wallet))}
                        </TableCell>
                        <TableCell>{fmtUsd(Number(t.amount_ud3 ?? t.amount_sd3), 4)} UD3</TableCell>
                        <TableCell className="text-xs">{String(t.created_at).slice(0, 19)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="withdrawals">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>金额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.yieldWithdrawals ?? []).map((w) => (
                    <TableRow key={String(w.id)}>
                      <TableCell>${fmtUsd(Number(w.amount_usdt), 4)}</TableCell>
                      <TableCell>{String(w.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{shortAddr(String(w.tx_hash ?? ''))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="subsidies">
              {(data.subsidyTickets ?? []).map((t) => (
                <div key={String(t.id)} className="border rounded-lg p-3 mb-2 text-sm">
                  <div className="flex justify-between">
                    <span>{String(t.kind)}</span>
                    <Badge>{String(t.status)}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">{String(t.purpose)}</p>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
