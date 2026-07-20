import { useEffect, useMemo, useState } from 'react';
import { PageShell } from './page-shell';
import { getAuditLogs, type AuditLogRow } from '@/lib/adminApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function fmtTime(s: string): string {
  return new Date(s).toLocaleString();
}

const ACTION_LABEL: Record<string, string> = {
  admin_login: '登录',
  admin_logout: '退出',
  member_subsidy_rate_set: '设置补贴比例',
};
function actionLabel(a: string): string {
  return ACTION_LABEL[a] ?? a;
}

function fmtDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分`;
  return `${Math.floor(ms / 1000)} 秒`;
}

type Session = { actor: string; login: string; logout: string | null; ms: number | null };

export default function LogsPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ops' | 'session'>('all');

  useEffect(() => {
    setLoading(true);
    getAuditLogs({ limit: 500 })
      .then((r) => setRows(r.logs))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  // Pair each login with the next logout per actor → session + 在线时长.
  const sessions = useMemo<Session[]>(() => {
    const byActor = new Map<string, AuditLogRow[]>();
    for (const r of rows) {
      if (r.action !== 'admin_login' && r.action !== 'admin_logout') continue;
      const k = r.actor_id ?? 'unknown';
      const list = byActor.get(k) ?? [];
      list.push(r);
      byActor.set(k, list);
    }
    const out: Session[] = [];
    for (const list of byActor.values()) {
      const asc = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      let pending: AuditLogRow | null = null;
      for (const r of asc) {
        if (r.action === 'admin_login') {
          pending = r;
        } else if (r.action === 'admin_logout' && pending) {
          const ms = new Date(r.created_at).getTime() - new Date(pending.created_at).getTime();
          out.push({ actor: pending.actor_name ?? pending.actor_id ?? '—', login: pending.created_at, logout: r.created_at, ms });
          pending = null;
        }
      }
      if (pending) {
        out.push({ actor: pending.actor_name ?? pending.actor_id ?? '—', login: pending.created_at, logout: null, ms: null });
      }
    }
    return out.sort((a, b) => b.login.localeCompare(a.login)).slice(0, 50);
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === 'session') return rows.filter((r) => r.action === 'admin_login' || r.action === 'admin_logout');
    if (filter === 'ops') return rows.filter((r) => r.action !== 'admin_login' && r.action !== 'admin_logout');
    return rows;
  }, [rows, filter]);

  return (
    <PageShell title="操作日志" subtitle="Operation log · 管理员操作 / 登录退出 / 在线时长">
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="text-sm font-semibold mb-3">登录会话 · 在线时长</div>
        <div className="space-y-1.5">
          {sessions.length === 0 ? (
            <div className="text-xs text-muted-foreground">暂无登录记录</div>
          ) : (
            sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs border-b border-border/40 pb-1.5 last:border-0">
                <span className="font-medium truncate flex-1">{s.actor}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {fmtTime(s.login)} → {s.logout ? fmtTime(s.logout) : '—'}
                </span>
                <span className={`whitespace-nowrap w-24 text-right ${s.ms == null ? 'text-emerald-500 font-semibold' : ''}`}>
                  {s.ms == null ? '在线中' : fmtDuration(s.ms)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'ops', 'session'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
            {f === 'all' ? '全部' : f === 'ops' ? '操作' : '登录/退出'}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">无记录</div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground w-40 shrink-0 whitespace-nowrap">{fmtTime(r.created_at)}</span>
                <span className="font-medium w-36 shrink-0 truncate">{r.actor_name ?? r.actor_type}</span>
                <Badge variant="outline" className="shrink-0">{actionLabel(r.action)}</Badge>
                <span className="text-muted-foreground truncate">
                  {r.entity_type ?? ''}
                  {r.entity_id ? ` · ${String(r.entity_id).slice(0, 12)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
