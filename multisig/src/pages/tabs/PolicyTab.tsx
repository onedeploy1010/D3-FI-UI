import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, ShieldCheck, Clock, Plus, Trash2, AlertTriangle, ShieldAlert, Lightbulb, Sparkles, ChevronDown } from 'lucide-react';
import {
  CURATED_POLICIES,
  POLICY_RECOMMENDATIONS,
  loadCustomPolicies,
  saveCustomPolicies,
  policyJson,
  type PolicyItem,
  type PolicyEffect,
  type PolicyReco,
} from '@/lib/policies';
import { CopyButton } from '@/components/CopyButton';

const TURNKEY = import.meta.env.VITE_TURNKEY_DASHBOARD_BASE ?? 'https://app.turnkey.com';

const RECO_STYLE: Record<PolicyReco['severity'], { badge: string; label: string; Icon: typeof AlertTriangle }> = {
  critical: { badge: 'text-red-700 bg-red-500/12', label: '严重', Icon: AlertTriangle },
  warn: { badge: 'text-amber-700 bg-amber-500/12', label: '注意', Icon: ShieldAlert },
  suggest: { badge: 'text-[#8A2B57] bg-[#8A2B57]/10', label: '建议', Icon: Lightbulb },
};

function RecoCard({ r, i }: { r: PolicyReco; i: number }) {
  const s = RECO_STYLE[r.severity];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04 }}
      className="brand-card rounded-2xl p-3.5 space-y-2"
    >
      <div className="flex items-center gap-2">
        <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
          <s.Icon size={11} /> {s.label}
        </span>
        <span className="text-[13px] font-bold text-[#160510] leading-snug">{r.title}</span>
      </div>
      <p className="text-[12px] text-[#160510]/75 leading-relaxed">{r.detail}</p>
      <div className="flex items-start gap-1.5 rounded-lg bg-[#E0568F]/[0.06] border border-[#E0568F]/12 px-2.5 py-2">
        <Sparkles size={12} className="mt-0.5 shrink-0 text-[#E0568F]" />
        <span className="text-[12px] font-medium text-[#160510]/85 leading-relaxed">{r.action}</span>
      </div>
    </motion.div>
  );
}

function PolicyCard({ item, i, onDelete }: { item: PolicyItem; i: number; onDelete?: () => void }) {
  const active = item.status === 'active';
  const json = policyJson(item.body);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04 }}
      className="brand-card rounded-2xl p-4 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-bold text-[#160510] truncate">{item.body.policyName}</span>
        <span
          className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            active ? 'text-emerald-700 bg-emerald-500/12' : 'text-amber-700 bg-amber-500/12'
          }`}
        >
          {active ? <ShieldCheck size={11} /> : <Clock size={11} />}
          {active ? '已生效' : '待完成'}
        </span>
      </div>

      {/* 名字 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-[#8A2B57]/55 w-8 shrink-0">名字</span>
        <span className="flex-1 min-w-0 text-[12px] font-mono text-[#160510] break-all">{item.body.policyName}</span>
        <CopyButton text={item.body.policyName} />
      </div>

      {/* 描述 */}
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-semibold text-[#8A2B57]/55 w-8 shrink-0 pt-0.5">描述</span>
        <span className="flex-1 min-w-0 text-[12px] text-[#160510]/80 leading-relaxed">{item.descZh}</span>
        <CopyButton text={item.descZh} />
      </div>

      {/* Turnkey JSON */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-[#8A2B57]/55">Turnkey Policy JSON</span>
          <CopyButton text={json} />
        </div>
        <div className="rounded-lg bg-[#8A2B57]/[0.05] border border-[#8A2B57]/10 overflow-x-auto">
          <pre className="text-[10px] font-mono text-[#8A2B57] p-2.5 whitespace-pre leading-relaxed">{json}</pre>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        {!active && (
          <a
            href={TURNKEY}
            target="_blank"
            rel="noreferrer"
            className="tap inline-flex items-center gap-1 text-[11px] font-bold text-white brand-gradient px-3 py-1.5 rounded-lg"
          >
            <ExternalLink size={12} /> 去 Turnkey 完成
          </a>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className="tap ml-auto p-2 rounded-lg text-red-500/70 bg-red-500/8" aria-label="删除">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function PolicyTab() {
  const [custom, setCustom] = useState<PolicyItem[]>(() => loadCustomPolicies());
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [effect, setEffect] = useState<PolicyEffect>('EFFECT_ALLOW');
  const [condition, setCondition] = useState('');
  const [consensus, setConsensus] = useState('');

  const active = useMemo(() => CURATED_POLICIES.filter((p) => p.status === 'active'), []);
  const todo = useMemo(() => CURATED_POLICIES.filter((p) => p.status === 'todo'), []);

  const addTemplate = () => {
    if (!name.trim()) return;
    const item: PolicyItem = {
      id: `custom-${Date.now()}`,
      status: 'todo',
      custom: true,
      descZh: desc.trim() || '（无描述）',
      body: {
        policyName: name.trim(),
        effect,
        condition: condition.trim() || 'true',
        consensus: consensus.trim() || 'approvers.count() >= 1',
      },
    };
    const next = [item, ...custom];
    setCustom(next);
    saveCustomPolicies(next);
    setName('');
    setDesc('');
    setCondition('');
    setConsensus('');
    setEffect('EFFECT_ALLOW');
    setShowAdd(false);
  };

  const removeCustom = (id: string) => {
    const next = custom.filter((c) => c.id !== id);
    setCustom(next);
    saveCustomPolicies(next);
  };

  const [showReco, setShowReco] = useState(true);
  const critCount = POLICY_RECOMMENDATIONS.filter((r) => r.severity === 'critical').length;

  return (
    <>
      <div className="brand-card rounded-2xl p-3.5 text-[11px] text-[#8A2B57]/75 leading-relaxed">
        D3 多签策略清单（Turnkey 格式）。<b className="text-[#160510]">实际生效状态以 Turnkey 后台为准</b>。可复制名字 / 描述 / JSON 直接到 Turnkey 使用，也可新增自定义模版。
      </div>

      {/* AI 审查与优化建议 */}
      <div className="space-y-2.5">
        <button type="button" onClick={() => setShowReco((v) => !v)} className="tap w-full flex items-center gap-2 pt-1">
          <Sparkles size={15} className="text-[#E0568F]" />
          <h2 className="text-[13px] font-bold text-[#8A2B57]/90 uppercase tracking-wider">AI 审查与优化建议</h2>
          {critCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-red-700 bg-red-500/12">
              <AlertTriangle size={10} /> {critCount} 严重
            </span>
          )}
          <ChevronDown size={16} className={`ml-auto text-[#8A2B57]/50 transition-transform ${showReco ? 'rotate-180' : ''}`} />
        </button>
        {showReco && POLICY_RECOMMENDATIONS.map((r, i) => <RecoCard key={r.id} r={r} i={i} />)}
      </div>

      {/* 新增模版 */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider">策略模版</h2>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="tap flex items-center gap-1 text-[11px] font-bold text-[#E0568F]">
          <Plus size={13} /> {showAdd ? '收起' : '新增模版'}
        </button>
      </div>
      {showAdd && (
        <div className="brand-card rounded-2xl p-4 space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="policyName（名字）" className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[13px] font-mono text-[#160510] focus:border-[#E0568F]/50" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="描述（中文说明）" className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[13px] text-[#160510] focus:border-[#E0568F]/50" />
          <div className="flex gap-2">
            {(['EFFECT_ALLOW', 'EFFECT_DENY'] as PolicyEffect[]).map((ef) => (
              <button key={ef} type="button" onClick={() => setEffect(ef)} className={`tap flex-1 py-2 rounded-xl text-[12px] font-bold ${effect === ef ? 'brand-gradient text-white' : 'bg-[#8A2B57]/8 text-[#8A2B57]'}`}>
                {ef === 'EFFECT_ALLOW' ? 'ALLOW 允许' : 'DENY 拒绝'}
              </button>
            ))}
          </div>
          <textarea value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="condition（如 eth.tx.to == '0x…'，默认 true）" rows={2} className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[12px] font-mono text-[#160510] focus:border-[#E0568F]/50 resize-none" />
          <textarea value={consensus} onChange={(e) => setConsensus(e.target.value)} placeholder="consensus（如 approvers.count() >= 2）" rows={2} className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-[#8A2B57]/12 outline-none text-[12px] font-mono text-[#160510] focus:border-[#E0568F]/50 resize-none" />
          <button type="button" onClick={addTemplate} disabled={!name.trim()} className="tap w-full py-3 rounded-xl brand-gradient text-white font-bold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={16} /> 保存模版
          </button>
        </div>
      )}
      {custom.map((item, i) => (
        <PolicyCard key={item.id} item={item} i={i} onDelete={() => removeCustom(item.id)} />
      ))}

      {/* 待完成 */}
      {todo.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">待去 Turnkey 完成</h2>
          {todo.map((item, i) => (
            <PolicyCard key={item.id} item={item} i={i} />
          ))}
        </>
      )}

      {/* 已生效 */}
      {active.length > 0 && (
        <>
          <h2 className="text-[13px] font-bold text-[#8A2B57]/80 uppercase tracking-wider pt-1">已生效</h2>
          {active.map((item, i) => (
            <PolicyCard key={item.id} item={item} i={i} />
          ))}
        </>
      )}

      <a href={TURNKEY} target="_blank" rel="noreferrer" className="tap flex items-center justify-center gap-2 brand-card rounded-2xl px-4 py-3 text-[13px] font-bold text-[#8A2B57] mt-1">
        <ExternalLink size={15} /> 打开 Turnkey 策略后台
      </a>
    </>
  );
}
