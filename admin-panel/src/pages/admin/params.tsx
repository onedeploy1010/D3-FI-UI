import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Lock, Loader2, Pencil, Plus, RefreshCw, Zap } from 'lucide-react';
import { PageShell } from './page-shell';
import { useAdminAuth } from '@/contexts/admin-auth';
import {
  getParams,
  updateParam,
  getHeartbeatConfig,
  updateHeartbeatConfig,
  listHeartbeatOrders,
  addHeartbeatOrder,
  generateHeartbeatOrder,
  type SystemParam,
  type HeartbeatConfig,
  type HeartbeatState,
  type HeartbeatOrderRow,
  type HeartbeatStatRow,
} from '@/lib/adminApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const GROUP_LABEL: Record<string, string> = {
  private_sale: '私募',
  partner_stake: '质押 / 合伙人',
  yield: '收益',
  subsidy: '补贴',
  bribe: '受贿金',
  ud3: 'UD3 档位',
  faucet: '水龙头',
  risk: '风控',
  heartbeat: '心跳订单',
};

function fmtValue(pm: SystemParam): string {
  if (pm.value_type === 'json') return JSON.stringify(pm.value);
  if (pm.value_type === 'boolean') return pm.value ? 'true' : 'false';
  return String(pm.value);
}

function parseDraft(type: SystemParam['value_type'], draft: string): unknown {
  if (type === 'number') {
    const n = Number(draft);
    if (!Number.isFinite(n)) throw new Error('无效数字');
    return n;
  }
  if (type === 'boolean') return draft.trim() === 'true';
  if (type === 'json') return JSON.parse(draft);
  return draft;
}

export default function ParamsPage() {
  const { hasPermission } = useAdminAuth();
  const canWrite = hasPermission('params.write');

  const [params, setParams] = useState<SystemParam[]>([]);
  const [loading, setLoading] = useState(true);

  const [hbConfig, setHbConfig] = useState<HeartbeatConfig | null>(null);
  const [hbState, setHbState] = useState<HeartbeatState>(null);
  const [hbOrders, setHbOrders] = useState<HeartbeatOrderRow[]>([]);
  const [hbStats, setHbStats] = useState<HeartbeatStatRow[]>([]);

  // Heartbeat config drafts
  const [intervalDraft, setIntervalDraft] = useState('');
  const [minDraft, setMinDraft] = useState('');
  const [maxDraft, setMaxDraft] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  // Param edit dialog
  const [editParam, setEditParam] = useState<SystemParam | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingParam, setSavingParam] = useState(false);

  // Manual add order dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addingOrder, setAddingOrder] = useState(false);

  const loadParams = useCallback(async () => {
    try {
      const r = await getParams();
      setParams(r.params);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载参数失败');
    }
  }, []);

  const loadHeartbeat = useCallback(async () => {
    try {
      const [cfg, list] = await Promise.all([getHeartbeatConfig(), listHeartbeatOrders()]);
      setHbConfig(cfg.config);
      setHbState(cfg.state);
      setIntervalDraft(String(cfg.config.intervalSeconds));
      setMinDraft(String(cfg.config.amountMin));
      setMaxDraft(String(cfg.config.amountMax));
      setHbOrders(list.orders);
      setHbStats(list.stats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载心跳数据失败');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadParams(), loadHeartbeat()]);
      setLoading(false);
    })();
  }, [loadParams, loadHeartbeat]);

  const grouped = useMemo(() => {
    const m = new Map<string, SystemParam[]>();
    for (const pm of params) {
      const arr = m.get(pm.param_group) ?? [];
      arr.push(pm);
      m.set(pm.param_group, arr);
    }
    return [...m.entries()];
  }, [params]);

  const stat = (source: string) =>
    hbStats.find((s) => s.source === source) ?? { order_count: 0, usdt_total: 0 };
  const real = stat('real');
  const added = stat('added');

  async function toggleEnabled(next: boolean) {
    if (!canWrite || !hbConfig) return;
    setHbConfig({ ...hbConfig, enabled: next });
    try {
      const r = await updateHeartbeatConfig({ enabled: next });
      setHbConfig(r.config);
      toast.success(next ? '已开始增单' : '已暂停增单');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
      loadHeartbeat();
    }
  }

  async function saveConfig() {
    if (!canWrite) return;
    setSavingCfg(true);
    try {
      const r = await updateHeartbeatConfig({
        intervalSeconds: Number(intervalDraft),
        amountMin: Number(minDraft),
        amountMax: Number(maxDraft),
      });
      setHbConfig(r.config);
      toast.success('心跳配置已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingCfg(false);
    }
  }

  async function saveParam() {
    if (!editParam) return;
    setSavingParam(true);
    try {
      const value = parseDraft(editParam.value_type, editDraft);
      await updateParam(editParam.param_key, value);
      toast.success('参数已更新');
      setEditParam(null);
      loadParams();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingParam(false);
    }
  }

  async function submitAddOrder() {
    setAddingOrder(true);
    try {
      await addHeartbeatOrder(Number(addAmount), addAddress.trim() || undefined);
      toast.success('已新增订单');
      setAddOpen(false);
      setAddAmount('');
      setAddAddress('');
      loadHeartbeat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '新增失败');
    } finally {
      setAddingOrder(false);
    }
  }

  async function genOne() {
    try {
      await generateHeartbeatOrder();
      toast.success('已生成一条');
      loadHeartbeat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    }
  }

  function openEdit(pm: SystemParam) {
    setEditParam(pm);
    setEditDraft(pm.value_type === 'json' ? JSON.stringify(pm.value, null, 2) : fmtValue(pm));
  }

  if (loading) {
    return (
      <PageShell title="参数管理" subtitle="Parameters">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="参数管理" subtitle="Parameters">
      <div className="space-y-6">
        {/* ── 心跳订单 ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-pink-500" />
                <div>
                  <div className="font-semibold">心跳订单</div>
                  <div className="text-xs text-muted-foreground">
                    真实订单 + 虚拟增单，供心跳指数组件显示
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {hbConfig?.enabled ? '运行中' : '已暂停'}
                </span>
                <Switch
                  checked={Boolean(hbConfig?.enabled)}
                  onCheckedChange={toggleEnabled}
                  disabled={!canWrite}
                />
              </div>
            </div>

            {/* Real vs added stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="原本 (真实) 单数" value={real.order_count.toLocaleString()} />
              <Stat label="原本 (真实) USDT" value={`$${Number(real.usdt_total).toLocaleString()}`} />
              <Stat label="增加 (虚拟) 单数" value={added.order_count.toLocaleString()} accent />
              <Stat label="增加 (虚拟) USDT" value={`$${Number(added.usdt_total).toLocaleString()}`} accent />
            </div>
            <div className="text-xs text-muted-foreground">
              累计生成 {hbState?.cumulative_count ?? 0} 条 · 上次增单{' '}
              {hbState?.last_tick_at ? new Date(hbState.last_tick_at).toLocaleString() : '—'}
            </div>

            {/* Frequency + amount range */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl cell-inset p-3 space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  增单间隔 (秒)
                </Label>
                <Input
                  value={intervalDraft}
                  onChange={(e) => setIntervalDraft(e.target.value)}
                  disabled={!canWrite}
                  inputMode="numeric"
                  className="w-full"
                />
              </div>
              <div className="rounded-xl cell-inset p-3 space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  虚单最小 (USDT)
                </Label>
                <Input
                  value={minDraft}
                  onChange={(e) => setMinDraft(e.target.value)}
                  disabled={!canWrite}
                  inputMode="numeric"
                  className="w-full"
                />
              </div>
              <div className="rounded-xl cell-inset p-3 space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  虚单最大 (USDT)
                </Label>
                <Input
                  value={maxDraft}
                  onChange={(e) => setMaxDraft(e.target.value)}
                  disabled={!canWrite}
                  inputMode="numeric"
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                onClick={saveConfig}
                disabled={!canWrite || savingCfg}
                size="sm"
                className="w-full sm:w-auto"
              >
                {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存配置'}
              </Button>
              <Button
                onClick={() => setAddOpen(true)}
                disabled={!canWrite}
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" /> 手动新增订单
              </Button>
              <Button
                onClick={genOne}
                disabled={!canWrite}
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Zap className="h-4 w-4" /> 立即生成一条
              </Button>
              <Button onClick={loadHeartbeat} size="sm" variant="ghost" className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4" /> 刷新
              </Button>
            </div>

            {/* Recent orders */}
            <div className="rounded-xl cell-inset overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">来源</th>
                    <th className="text-left font-medium px-3 py-2">地址</th>
                    <th className="text-right font-medium px-3 py-2">金额</th>
                    <th className="text-right font-medium px-3 py-2">D3</th>
                    <th className="text-right font-medium px-3 py-2">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {hbOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        暂无虚拟订单
                      </td>
                    </tr>
                  ) : (
                    hbOrders.slice(0, 40).map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2">
                          <Badge variant={o.source === 'manual' ? 'default' : 'secondary'}>
                            {o.source === 'manual' ? '手动' : '自动'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {o.address.slice(0, 8)}…{o.address.slice(-6)}
                        </td>
                        <td className="px-3 py-2 text-right">${Number(o.amount_usdt).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{Number(o.d3).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── 系统参数 ─────────────────────────────────────────────── */}
        {grouped.map(([group, list]) => (
          <Card key={group}>
            <CardContent className="p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABEL[group] ?? group}
              </div>
              <div className="space-y-2">
                {list.map((pm) => (
                  <div
                    key={pm.param_key}
                    className="flex flex-col gap-3 rounded-xl cell-inset p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{pm.label}</span>
                        {pm.on_chain && (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/40">
                            <Lock className="h-3 w-3" /> 将由多签管理
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 overflow-x-auto text-xs font-mono text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {pm.param_key} = <span className="text-primary">{fmtValue(pm)}</span>
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(pm)}
                      disabled={!canWrite || !pm.editable}
                      className="w-full sm:w-auto sm:shrink-0"
                    >
                      <Pencil className="h-4 w-4" /> 编辑
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Param edit dialog */}
      <Dialog open={Boolean(editParam)} onOpenChange={(o) => !o && setEditParam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editParam?.label}</DialogTitle>
          </DialogHeader>
          {editParam && (
            <div className="space-y-2">
              <div className="rounded-xl cell-inset p-2 text-xs text-muted-foreground font-mono overflow-x-auto">
                <span className="whitespace-nowrap">{editParam.param_key}</span>
              </div>
              {editParam.value_type === 'json' ? (
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={8}
                  className="w-full font-mono text-xs"
                />
              ) : editParam.value_type === 'boolean' ? (
                <select
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  className="w-full h-9 rounded-md cell-inset px-3 text-sm text-foreground"
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <Input
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  inputMode={editParam.value_type === 'number' ? 'decimal' : 'text'}
                  className="w-full"
                />
              )}
              {editParam.on_chain && (
                <p className="text-xs text-amber-600">
                  该参数将由多签治理，此处修改仅更新本地登记值。
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditParam(null)}>
              取消
            </Button>
            <Button onClick={saveParam} disabled={savingParam}>
              {savingParam ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual add order dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手动新增显示订单</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                金额 (USDT)
              </Label>
              <Input
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                inputMode="decimal"
                placeholder="500"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                地址 (可选，留空自动生成)
              </Label>
              <Input
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                placeholder="0x…"
                className="w-full font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={submitAddOrder} disabled={addingOrder || !addAmount}>
              {addingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : '新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl cell-inset p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}
