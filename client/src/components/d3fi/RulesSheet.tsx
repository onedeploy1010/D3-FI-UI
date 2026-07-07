import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { GlassIconButton } from '@/components/ui/GlassSurface';

type Lang = 'zh' | 'en';
export type RuleTopic = 'bribePool' | 'weightDividends' | 'vote' | 'dusd' | 'stakingRate' | 'claim' | 'teamRewards' | 'general';

export function RulesSheet({
  open,
  onClose,
  lang,
  isDark,
  topic = 'general',
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  isDark: boolean;
  topic?: RuleTopic;
}) {
  const t = lang === 'zh';

  const sections: { id: RuleTopic; titleZh: string; titleEn: string; bulletsZh: string[]; bulletsEn: string[] }[] = [
    {
      id: 'bribePool',
      titleZh: '当期贿赂池（Epoch）',
      titleEn: 'Current Bribe Pool (Epoch)',
      bulletsZh: [
        '当期贿赂池包含项目方投放的贿赂与协议规则产生的可分配部分。',
        '贿赂项目按目标 Gauge 绑定，投票者按 veD3 权重比例分享该 Gauge 的贿赂收益。',
        '结算发生在 Epoch 结束后，收益进入可领取状态。',
      ],
      bulletsEn: [
        'The bribe pool aggregates project bribes and protocol-distributable parts.',
        'Bribes are attached to a target Gauge; voters earn by veD3 weight share.',
        'Rewards become claimable after epoch settlement.',
      ],
    },
    {
      id: 'weightDividends',
      titleZh: '权重分红率如何体现',
      titleEn: 'Where Weight Dividend Rate Shows',
      bulletsZh: [
        'DT 权重分红率 = 你的 DT ÷ 全网 DT；个人分红以 USDT 结算领取到钱包。',
        'veD3 投票收益 = (个人票数 ÷ 项目总票数) × (贿赂 + LP 手续费等)，以 USDT 领取。',
        'D3 排放分配：65% Gauge 投票者 · 15% veD3 底薪(≥180d) · 10% DT Top5 · 10% 守护池。',
        '守护池用于协议安全储备与回购，不直接参与个人权重分红计算。',
      ],
      bulletsEn: [
        'DT rate = your DT ÷ total DT; your dividend share settles as USDT to your wallet.',
        'veD3 reward = (your votes ÷ project votes) × (bribes + LP fees, etc.), claimed as USDT.',
        'Emission split: 65% gauge voters · 15% veD3 base (≥180d) · 10% DT Top5 · 10% guardian pool.',
        'Guardian pool funds security reserves and buybacks; not part of personal weight dividends.',
      ],
    },
    {
      id: 'stakingRate',
      titleZh: '质押率与日化',
      titleEn: 'Staking Rate & Daily Yield',
      bulletsZh: [
        '增长期：日化 = 下限 + (上限−下限) × 质押率。',
        '可持续期：日化 = 上限 − (上限−下限) × 质押率（用于保护池寿命）。',
      ],
      bulletsEn: [
        'Growth: Daily = floor + (ceil−floor) × stake rate.',
        'Sustain: Daily = ceil − (ceil−floor) × stake rate (pool protection).',
      ],
    },
    {
      id: 'claim',
      titleZh: '收益领取说明',
      titleEn: 'Claiming Rewards',
      bulletsZh: [
        '待领取收益为 Epoch 结算后、尚未提取到钱包的治理分红（USDT）。',
        '贿赂分成、LP 手续费、DT 权重分红等均以 USDT 直接领取到已连接钱包。',
        '推荐奖励（dUSD）在「我的 → 推荐」或「资产 → dUSD」入账，用于质押投资，不在此领取。',
        '每次领取单独消耗 gas。',
      ],
      bulletsEn: [
        'Claimable rewards are epoch-settled governance dividends (USDT) not yet withdrawn to your wallet.',
        'Bribes, LP fees, DT weight share, etc. are claimed as USDT directly to your connected wallet.',
        'Referral rewards (dUSD) credit on Me → Refer or Assets → dUSD for staking — not claimed here.',
        'Each claim costs gas.',
      ],
    },
    {
      id: 'vote',
      titleZh: '投票与收益',
      titleEn: 'Voting & Rewards',
      bulletsZh: [
        '投票按贿赂项目分配 veD3，每个项目对应一个目标 Gauge。',
        '权重分红率 = 你对该项目的票数 ÷ 该项目总票数。',
        '投票期可调整分配；结算后进入领取期。',
      ],
      bulletsEn: [
        'Allocate veD3 per bribe project; each project targets one Gauge.',
        'Weight rate = your votes on that project ÷ project total votes.',
        'Adjust during voting; claim after settlement.',
      ],
    },
    {
      id: 'teamRewards',
      titleZh: '团队 / 推荐奖励怎么给',
      titleEn: 'How Team & Referral Rewards Work',
      bulletsZh: [
        '团队奖励（动态/推荐）与治理分红（收益页 USDT）是两条通道，不要混淆。',
        '推荐奖励 = 下级入金的 30%，全部以 dUSD 入账，用于质押投资，不可提现。',
        'dUSD 30% 中：15% 自留可质押；15% 为可转让额度，仅可转给直推下线用于质押。',
        '动态收益（PoC 级差 + PoN 算力）另按白皮书规则结算，每日 00:00、180 天线性释放。',
        '治理分红（贿赂、LP、权重分红等）在收益页以 USDT 直接领取到钱包。',
      ],
      bulletsEn: [
        'Team/referral rewards are separate from governance dividends (USDT on Earn tab).',
        'Referral reward = 30% of downline entry, all credited as dUSD for staking/investment — not withdrawable.',
        'Within the 30% dUSD: 15% self for staking; 15% transferable quota to direct downline only.',
        'Dynamic rewards (PoC + PoN) follow whitepaper rules: daily settle, 180d linear vesting.',
        'Governance dividends (bribes, LP, weight share, etc.) are claimed as USDT to wallet on Earn.',
      ],
    },
    {
      id: 'dusd',
      titleZh: 'dUSD 与可转让额度',
      titleEn: 'dUSD & Transferable Quota',
      bulletsZh: [
        'dUSD 为协议内质押专用资产（USDT 1:1 铸造），不可在 DEX 交易，也不可提现。',
        '用于 LP/销毁债券入场质押，以及接收推荐奖励（入金 30%，全部为 dUSD）。',
        '推荐奖励入账后用于投资质押；其中 15% 为可转让额度，仅可转给直推下线。',
        '治理分红（贿赂、LP、权重分红等）为 USDT，在收益页直接领取到钱包。',
      ],
      bulletsEn: [
        'dUSD is the in-protocol staking asset (minted 1:1 with USDT); not DEX-tradable or withdrawable.',
        'Used for LP/burn bond staking and referral rewards (30% of entry, all dUSD).',
        'Referral dUSD credits for staking/investment; 15% is transferable quota to direct downline only.',
        'Governance dividends (bribes, LP, weight share, etc.) are USDT, claimed to wallet on Earn.',
      ],
    },
    {
      id: 'general',
      titleZh: '规则说明',
      titleEn: 'Rules',
      bulletsZh: ['本页只展示规则解释，具体数据以链上结算结果为准。'],
      bulletsEn: ['This page explains rules; final numbers follow on-chain settlement.'],
    },
  ];

  const order: RuleTopic[] =
    topic === 'general' ? ['general', 'teamRewards', 'bribePool', 'weightDividends', 'stakingRate', 'claim', 'dusd', 'vote'] : [topic, 'teamRewards', 'weightDividends', 'bribePool', 'claim', 'dusd', 'vote', 'stakingRate', 'general'];

  const ordered = order
    .map((id) => sections.find((s) => s.id === id))
    .filter(Boolean) as typeof sections;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="ios-glass-card w-full max-w-lg rounded-3xl p-5 sm:p-6 relative pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="ios-glass-sheen pointer-events-none" aria-hidden />
            <div className="flex items-start justify-between gap-3 mb-4 relative z-10">
              <div>
                <div className={`text-[10px] font-semibold tracking-wider uppercase ${isDark ? 'text-[#C9A96E]/55' : 'text-[#6B1A3A]/45'}`}>
                  {t ? '规则' : 'Rules'}
                </div>
                <div className={`text-lg font-bold font-heading ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
                  {t ? '机制说明' : 'Mechanism Notes'}
                </div>
              </div>
              <GlassIconButton onClick={onClose} aria-label="Close rules">
                <X size={16} className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'} />
              </GlassIconButton>
            </div>

            <div className="space-y-4 relative z-10">
              {ordered.map((sec) => (
                <div key={sec.id} className="ios-glass-inset p-4">
                  <div className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
                    {t ? sec.titleZh : sec.titleEn}
                  </div>
                  <ul className={`space-y-1 text-[11px] leading-relaxed ${isDark ? 'text-white/45' : 'text-[#2C2824]/50'}`}>
                    {(t ? sec.bulletsZh : sec.bulletsEn).map((b) => (
                      <li key={b}>- {b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

