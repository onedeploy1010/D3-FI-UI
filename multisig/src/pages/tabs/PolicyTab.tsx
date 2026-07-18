import { motion } from 'framer-motion';
import { ExternalLink, ShieldCheck, Clock } from 'lucide-react';
import { POLICIES, type PolicyItem } from '@/lib/policies';

const TURNKEY = import.meta.env.VITE_TURNKEY_DASHBOARD_BASE ?? 'https://app.turnkey.com';

function PolicyCard({ item, i }: { item: PolicyItem; i: number }) {
  const active = item.status === 'active';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className="brand-card rounded-2xl p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[14px] font-bold text-[#160510]">{item.name}</span>
        <span
          className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            active ? 'text-emerald-700 bg-emerald-500/12' : 'text-amber-700 bg-amber-500/12'
          }`}
        >
          {active ? <ShieldCheck size={11} /> : <Clock size={11} />}
          {active ? '已生效' : '待完成'}
        </span>
      </div>
      <div className="text-[10px] font-semibold text-[#8A2B57]/55 mb-2">{item.category}</div>
      <p className="text-[12px] leading-relaxed text-[#160510]/80 mb-2.5">{item.descZh}</p>
      <pre className="text-[10px] font-mono bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 rounded-lg p-2.5 text-[#8A2B57] whitespace-pre-wrap break-words leading-relaxed">
{item.template}
      </pre>
      {!active && (
        <a
          href={TURNKEY}
          target="_blank"
          rel="noreferrer"
          className="tap mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-3 py-1.5 rounded-lg"
        >
          <ExternalLink size={12} /> 去 Turnkey 完成
        </a>
      )}
    </motion.div>
  );
}

export function PolicyTab() {
  const active = POLICIES.filter((p) => p.status === 'active');
  const todo = POLICIES.filter((p) => p.status === 'todo');

  return (
    <>
      <div className="brand-card rounded-2xl p-3.5 text-[11px] text-[#8A2B57]/75 leading-relaxed">
        D3 多签策略清单与中文说明。<b className="text-[#160510]">实际生效状态以 Turnkey 后台为准</b>；标「待完成」的需在 Turnkey 控制台配置或批准。
      </div>

      {todo.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">待去 Turnkey 完成</h2>
          {todo.map((item, i) => (
            <PolicyCard key={item.id} item={item} i={i} />
          ))}
        </>
      )}

      {active.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">已生效</h2>
          {active.map((item, i) => (
            <PolicyCard key={item.id} item={item} i={i} />
          ))}
        </>
      )}

      <a
        href={TURNKEY}
        target="_blank"
        rel="noreferrer"
        className="tap flex items-center justify-center gap-2 brand-card rounded-2xl px-4 py-3 text-[13px] font-bold text-[#8A2B57] mt-1"
      >
        <ExternalLink size={15} /> 打开 Turnkey 策略后台
      </a>
    </>
  );
}
