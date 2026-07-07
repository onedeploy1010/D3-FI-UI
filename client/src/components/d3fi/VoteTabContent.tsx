import { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Zap, Gift, HelpCircle } from 'lucide-react';
import { glassCardClass, GlassButton, GlassIconButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import { bribeProjects } from './protocolData';
import { RulesSheet } from '@/components/d3fi/RulesSheet';

type Lang = 'zh' | 'en';

function parseVoteCount(value: string) {
  return Number(value.replace(/[^0-9.]/g, '')) || 1;
}

export function VoteTabContent({
  lang,
  isDark,
  focusProjectId,
  onFocusHandled,
}: {
  lang: Lang;
  isDark: boolean;
  focusProjectId?: string | null;
  onFocusHandled?: () => void;
}) {
  const t = lang === 'zh';
  const totalPower = 2400;
  const activeProjects = useMemo(() => bribeProjects.filter((p) => p.status === 'active'), []);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [highlightProject, setHighlightProject] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>(() =>
    Object.fromEntries(activeProjects.map((p) => [p.id, p.id === 'alpha' ? 800 : 0])),
  );

  useEffect(() => {
    if (!focusProjectId) return;
    setHighlightProject(focusProjectId);
    const el = document.getElementById(`vote-project-${focusProjectId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    onFocusHandled?.();
    const timer = window.setTimeout(() => setHighlightProject(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusProjectId, onFocusHandled]);

  const used = Object.values(allocations).reduce((a, b) => a + b, 0);
  const remaining = totalPower - used;

  const setAllocation = (id: string, value: number) => {
    const clamped = Math.max(0, Math.min(totalPower, value));
    setAllocations((prev) => ({ ...prev, [id]: clamped }));
  };

  const epochPhases = t
    ? ['锁仓', '投票', '贿赂', '结算', '领取']
    : ['Lock', 'Vote', 'Bribe', 'Settle', 'Claim'];

  return (
    <div className="space-y-5">
      {/* Epoch */}
      <div className={glassCardClass('default', 'p-4')}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>Epoch #42</div>
            <div className={`text-xs font-semibold flex items-center gap-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
              <Clock size={12} className="text-[#C9A96E]" />
              {t ? '结算倒计时 5d 12h' : 'Settlement in 5d 12h'}
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-[#C9A96E]/10 text-[#C9A96E] font-medium">
            {t ? '投票期' : 'Voting'}
          </span>
        </div>
        <div className="flex gap-1">
          {epochPhases.map((phase, i) => (
            <div key={phase} className="flex-1 text-center">
              <div className={cn(
                'h-1 rounded-full mb-1',
                i <= 1 ? 'bg-[#C9A96E]' : isDark ? 'bg-white/10' : 'bg-[#6B1A3A]/10',
              )} />
              <div className={`text-[8px] ${i === 1 ? 'text-[#C9A96E] font-semibold' : isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
                {phase}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* veD3 power */}
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A96E]/40 to-transparent" />
        <div className="flex items-center justify-between mb-2">
          <div className={`text-xs ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>{t ? 'veD3 投票权' : 'veD3 Voting Power'}</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">{t ? '可投票' : 'Active'}</span>
            <GlassIconButton
              onClick={() => setRulesOpen(true)}
              aria-label="Open voting rules"
            >
              <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
            </GlassIconButton>
          </div>
        </div>
        <div className="text-3xl font-bold font-heading" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>{totalPower.toLocaleString()} veD3</div>
        <div className="flex gap-4 mt-2 text-[10px]">
          <span className={isDark ? 'text-white/35' : 'text-[#2C2824]/35'}>{t ? '已分配' : 'Allocated'}: <span className="text-[#C9A96E] font-semibold">{used}</span></span>
          <span className={isDark ? 'text-white/35' : 'text-[#2C2824]/35'}>{t ? '剩余' : 'Remaining'}: <span className={remaining < 0 ? 'text-red-400' : ''}>{remaining}</span></span>
        </div>
        <div className={`h-1.5 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-[#6B1A3A]/[0.06]'}`}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#6B1A3A] to-[#C9A96E]" style={{ width: `${Math.min(100, (used / totalPower) * 100)}%` }} />
        </div>
        <div className={`mt-3 text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
          {t ? '我的权重分红率（按项目）= 我对该项目的票数 ÷ 该项目总票数' : 'Your rate per project = your votes ÷ project total votes'}
        </div>
      </div>

      {/* Vote allocation by project */}
      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? '项目投票' : 'Project Votes'}
        </div>
        <div className="space-y-4">
          {activeProjects.map((project) => {
            const myVotes = allocations[project.id] ?? 0;
            const projectTotal = parseVoteCount(project.totalVotes);
            const weightRate = projectTotal > 0 ? (myVotes / projectTotal) * 100 : 0;

            return (
              <div
                key={project.id}
                id={`vote-project-${project.id}`}
                className={cn(
                  'ios-glass-inset p-4 transition-shadow',
                  myVotes > 0 && 'ring-1 ring-[#C9A96E]/20',
                  highlightProject === project.id && 'ring-2 ring-[#C9A96E]/50',
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <span className={`text-sm font-semibold block ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
                      {t ? project.nameZh : project.name}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
                      Gauge · {project.gauge}
                    </span>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${isDark ? 'text-[#C9A96E]' : 'text-[#6B1A3A]'}`}>
                    {myVotes} veD3
                  </span>
                </div>
                <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>
                  {t ? '我的权重分红率' : 'My dividend rate'}:{' '}
                  <span className="text-emerald-500 font-semibold">{weightRate.toFixed(3)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={totalPower}
                  step={50}
                  value={myVotes}
                  onChange={(e) => setAllocation(project.id, Number(e.target.value))}
                  className="w-full accent-[#6B1A3A] h-1"
                />
                <div className={`flex flex-wrap gap-x-3 mt-2 text-[10px] ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>
                  <span>{t ? '贿赂池' : 'Bribe'}: {project.bribeAmount}</span>
                  <span>{t ? '每票' : 'Per vote'}: {project.perVote}</span>
                  <span>{t ? '总票' : 'Total'}: {project.totalVotes}</span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    {project.deadline}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <GlassButton variant="primary" className="flex-1 !py-2.5 !text-xs" disabled={remaining !== 0}>
            {t ? '确认投票' : 'Confirm Votes'}
          </GlassButton>
          <GlassButton
            variant="secondary"
            className="!py-2.5 !text-xs"
            onClick={() => setAllocations(Object.fromEntries(activeProjects.map((p) => [p.id, 0])))}
          >
            <RefreshCw size={12} />
          </GlassButton>
        </div>
      </div>

      {/* Reward estimate */}
      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? '本期收益预估（按权重）' : 'Epoch Reward Est. (by weight)'}
        </div>
        <div className="space-y-2">
          {[
            { icon: Zap, label: t ? 'D3 排放 (65%)' : 'D3 Emission (65%)', value: '~42 D3', desc: t ? '按项目投票占比分配对应 Gauge 排放' : 'Gauge emissions by project vote share' },
            { icon: Gift, label: t ? '贿赂分成' : 'Bribe Share', value: '~$18.50', desc: t ? '项目 USDT 贿赂池按 veD3 权重分红' : 'Project USDT bribes by veD3 weight' },
            { icon: RefreshCw, label: t ? 'LP 手续费 (100%)' : 'LP Fees (100%)', value: '~$6.20', desc: t ? '所投项目对应 Gauge 手续费全部分给投票者' : 'All LP fees to voters of that project\'s gauge' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3 py-2 border-b last:border-0 border-white/5">
              <div className="ios-glass-inset w-8 h-8 flex items-center justify-center shrink-0">
                <item.icon size={14} className="text-[#C9A96E]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{item.label}</span>
                  <span className="text-xs font-semibold text-emerald-500">{item.value}</span>
                </div>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} lang={lang} isDark={isDark} topic="vote" />
    </div>
  );
}
