import { useState } from 'react';
import { ArrowLeft, Clock, ExternalLink, Users, Vote, HelpCircle, Search, ArrowUpDown, CalendarDays } from 'lucide-react';
import { glassCardClass, GlassButton, GlassIconButton } from '@/components/ui/GlassSurface';
import { cn } from '@/lib/utils';
import type { BribeProjectView, ProtocolEpochView } from '@/lib/protocolTypes';
import { RulesSheet } from '@/components/d3fi/RulesSheet';

type Lang = 'zh' | 'en';

function BribeProjectDetail({
  project,
  lang,
  isDark,
  onBack,
  onGoVote,
}: {
  project: BribeProjectView;
  lang: Lang;
  isDark: boolean;
  onBack: () => void;
  onGoVote: (projectId: string) => void;
}) {
  const t = lang === 'zh';
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className={`flex items-center gap-1.5 text-xs font-medium ios-glass-pressable ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}
      >
        <ArrowLeft size={14} /> {t ? '返回项目列表' : 'Back to list'}
      </button>

      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className={`text-lg font-bold font-stat ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              {t ? project.nameZh : project.name}
            </h2>
            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>Gauge · {project.gauge}</p>
          </div>
          <span className={cn(
            'text-[9px] px-2 py-0.5 rounded-full font-semibold shrink-0',
            project.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-white/40',
          )}>
            {project.status === 'active' ? (t ? '进行中' : 'Active') : (t ? '已结束' : 'Ended')}
          </span>
        </div>
        <div className="text-2xl font-bold font-stat mb-1" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>
          {project.bribeAmount}
        </div>
        <p className={`text-[11px] leading-relaxed text-pretty-wrap ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
          {t ? project.descriptionZh : project.descriptionEn}
        </p>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '贿赂详情' : 'Bribe Details'}
        </div>
        <div className="space-y-2.5">
          {[
            { label: t ? '目标 Gauge' : 'Target Gauge', value: project.gauge },
            { label: t ? '每票贿赂' : 'Per Vote', value: project.perVote },
            { label: t ? '累计得票' : 'Total Votes', value: project.totalVotes },
            { label: t ? '投票人数' : 'Voters', value: String(project.voters) },
            { label: t ? 'Epoch' : 'Epoch', value: project.epoch },
            { label: t ? '截止' : 'Deadline', value: project.deadline },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1.5 text-xs">
              <span className={isDark ? 'text-white/40' : 'text-[#160510]/40'}>{row.label}</span>
              <span className={`font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{row.value}</span>
            </div>
          ))}
        </div>
        <a
          href={project.website}
          target="_blank"
          rel="noreferrer"
          className={`mt-4 flex items-center justify-center gap-1.5 text-[11px] font-medium ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}
        >
          {t ? '访问项目官网' : 'Visit Website'} <ExternalLink size={12} />
        </a>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '投票者收益预估' : 'Voter Reward Est.'}
        </div>
        <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
          {t
            ? '按 veD3 权重比例分配：贿赂 USDT + 对应 Gauge 排放 + 100% LP 手续费'
            : 'Distributed by veD3 weight: bribe USDT + gauge emissions + 100% LP fees'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t ? '贿赂' : 'Bribe', value: project.perVote },
            { label: t ? '排放' : 'Emission', value: '—' },
            { label: 'LP', value: '—' },
          ].map((item) => (
            <div key={item.label} className="ios-glass-inset p-2.5 text-center">
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{item.label}</div>
              <div className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{item.value}</div>
              <div className={`text-[8px] ${isDark ? 'text-white/25' : 'text-[#160510]/25'}`}>/vote</div>
            </div>
          ))}
        </div>
        <GlassButton
          variant="secondary"
          className="mt-4 w-full !py-2.5 !text-xs flex items-center gap-1.5"
          onClick={() => onGoVote(project.id)}
        >
          <Vote size={14} /> {t ? '前往投票' : 'Go to Vote'}
        </GlassButton>
      </div>
    </div>
  );
}

export function BribeMarketTab({
  lang,
  isDark,
  onGoVote,
  epoch,
  projects = [],
  isLoading = false,
}: {
  lang: Lang;
  isDark: boolean;
  onGoVote: (projectId: string) => void;
  epoch?: ProtocolEpochView | null;
  projects?: BribeProjectView[];
  isLoading?: boolean;
}) {
  const t = lang === 'zh';
  const [filter, setFilter] = useState<'all' | 'active' | 'ended'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [sort, setSort] = useState<'amountDesc' | 'perVoteDesc' | 'votersDesc'>('amountDesc');

  const activeCount = projects.filter((p) => p.status === 'active').length;
  const poolTvl = isLoading ? '…' : (epoch?.bribePoolTvl ?? '—');
  const epochLabel = isLoading ? '…' : (epoch?.label ?? '—');
  const poolAdded = isLoading ? '…' : (epoch?.bribePoolAdded ?? '—');

  const selected = projects.find((p) => p.id === selectedId);
  if (selected) {
    return (
      <BribeProjectDetail
        project={selected}
        lang={lang}
        isDark={isDark}
        onBack={() => setSelectedId(null)}
        onGoVote={onGoVote}
      />
    );
  }

  const filtered = projects
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => {
      if (!q.trim()) return true;
      const s = q.trim().toLowerCase();
      return (t ? p.nameZh : p.name).toLowerCase().includes(s) || p.gauge.toLowerCase().includes(s);
    })
    .sort((a, b) => {
      if (sort === 'votersDesc') return b.voters - a.voters;
      if (sort === 'perVoteDesc') return Number(b.perVote.replace(/[^0-9.]/g, '')) - Number(a.perVote.replace(/[^0-9.]/g, ''));
      return Number(b.bribeAmount.replace(/[^0-9.]/g, '')) - Number(a.bribeAmount.replace(/[^0-9.]/g, ''));
    });

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className="flex items-center justify-between gap-3">
          <div className={`text-xs ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>{t ? '当期贿赂池' : 'Current Bribe Pool'}</div>
          <GlassIconButton onClick={() => setRulesOpen(true)} aria-label="Open bribe pool rules">
            <HelpCircle size={16} className={isDark ? 'text-white/40' : 'text-[#160510]/40'} />
          </GlassIconButton>
        </div>
        <div className="text-3xl font-bold font-stat" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{poolTvl}</div>
        <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
          <span>{t ? '本 Epoch' : 'Epoch'} {epochLabel}</span>
          <span>{t ? '新增' : 'Added'}: <span className="text-emerald-500">{poolAdded}</span></span>
          <span>{t ? '项目' : 'Projects'}: {isLoading ? '…' : activeCount}</span>
        </div>
      </div>

      <div className="ios-glass-tab-bar flex gap-1">
        {([
          { id: 'all' as const, label: t ? '全部' : 'All' },
          { id: 'active' as const, label: t ? '进行中' : 'Active' },
          { id: 'ended' as const, label: t ? '已结束' : 'Ended' },
        ]).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'relative flex-1 py-2 rounded-xl text-[11px] font-semibold ios-glass-pressable',
              filter === f.id ? (isDark ? 'text-white' : 'text-[#8A2B57]') : (isDark ? 'text-white/40' : 'text-[#160510]/40'),
            )}
          >
            {filter === f.id && <span className="ios-glass-tab-active absolute inset-0" />}
            <span className="relative z-10">{f.label}</span>
          </button>
        ))}
      </div>

      <div className={glassCardClass('default', 'p-4 sm:p-5')}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
            {t ? '贿赂项目列表' : 'Bribe Projects'}
          </div>
          <button
            type="button"
            onClick={() =>
              setSort(sort === 'amountDesc' ? 'perVoteDesc' : sort === 'perVoteDesc' ? 'votersDesc' : 'amountDesc')
            }
            className={`text-[10px] font-semibold ios-glass-pressable ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/75'}`}
          >
            <ArrowUpDown size={12} className="inline mr-1" />
            {sort === 'amountDesc' ? (t ? '金额' : 'Amount') : sort === 'perVoteDesc' ? (t ? '每票' : 'Per vote') : (t ? '人数' : 'Voters')}
          </button>
        </div>

        <div className="ios-glass-inset p-3 mb-3">
          <div className="flex items-center gap-2">
            <Search size={14} className={isDark ? 'text-white/30' : 'text-[#160510]/30'} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t ? '搜索项目 / Gauge' : 'Search project / gauge'}
              className={`w-full bg-transparent outline-none text-xs ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/25'}`}
            />
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setRange('7d')}
            className={cn('flex-1 ios-glass-inset py-2 text-[10px] font-semibold ios-glass-pressable', range === '7d' && 'ring-1 ring-[#E0568F]/20')}
          >
            <CalendarDays size={12} className="inline mr-1 text-[#E0568F]" />
            7D
          </button>
          <button
            type="button"
            onClick={() => setRange('30d')}
            className={cn('flex-1 ios-glass-inset py-2 text-[10px] font-semibold ios-glass-pressable', range === '30d' && 'ring-1 ring-[#E0568F]/20')}
          >
            30D
          </button>
          <button
            type="button"
            onClick={() => setRange('all')}
            className={cn('flex-1 ios-glass-inset py-2 text-[10px] font-semibold ios-glass-pressable', range === 'all' && 'ring-1 ring-[#E0568F]/20')}
          >
            {t ? '全部' : 'All'}
          </button>
        </div>

        <div className={`text-[10px] mb-2 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
          {t ? '日期区间' : 'Date range'}: {range === '7d' ? '7D' : range === '30d' ? '30D' : t ? '全部' : 'All'} · {t ? '筛选' : 'Filter'}: {filter}
        </div>

        <div className="space-y-2">
          {isLoading && filtered.length === 0 ? (
            <div className={`text-xs py-6 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
              {t ? '加载中…' : 'Loading…'}
            </div>
          ) : filtered.length === 0 ? (
            <div className={`text-xs py-6 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
              {t ? '暂无贿赂项目' : 'No bribe projects'}
            </div>
          ) : (
            filtered.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedId(project.id)}
                className="w-full text-left ios-glass-inset p-3.5 ios-glass-pressable"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#160510]'}`}>
                    {t ? project.nameZh : project.name}
                  </span>
                  <span className="text-xs font-bold" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{project.bribeAmount}</span>
                </div>
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
                  <span>Gauge: {project.gauge}</span>
                  <span>{t ? '每票' : '/vote'}: {project.perVote}</span>
                  <span className="flex items-center gap-0.5"><Clock size={9} /> {project.deadline}</span>
                  <span className="flex items-center gap-0.5"><Users size={9} /> {project.voters}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} lang={lang} isDark={isDark} topic="bribePool" />
    </div>
  );
}
