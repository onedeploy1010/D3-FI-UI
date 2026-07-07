import { useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, Lock, Send, Info } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import {
  dUsdAccount,
  referralEpoch,
  referralPending,
  transferableQuota,
} from '@/components/d3fi/rewardData';

type Lang = 'zh' | 'en';

export function DUsdTab({ lang, isDark }: { lang: Lang; isDark: boolean }) {
  const t = lang === 'zh';
  const [mode, setMode] = useState<'overview' | 'deposit' | 'transfer'>('overview');
  const [depositAmount, setDepositAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferTo, setTransferTo] = useState('');

  const transferableLeft = transferableQuota.remaining;

  if (mode === 'deposit') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>
          ← {t ? '返回 dUSD' : 'Back to dUSD'}
        </button>
        <div className={glassCardClass('default', 'p-5')}>
          <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '充值 dUSD' : 'Deposit dUSD'}
          </div>
          <p className={`text-[11px] mb-4 leading-relaxed ${isDark ? 'text-white/40' : 'text-[#2C2824]/45'}`}>
            {t ? '使用 USDT 按 1:1 铸造 dUSD。dUSD 是协议内质押与团队奖励的专用资产，不可直接在 DEX 交易。' : 'Mint dUSD 1:1 with USDT. dUSD is used for staking and team rewards; not tradable on DEX.'}
          </p>
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '充值金额' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="text"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-2xl font-bold font-heading outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#2C2824] placeholder:text-[#2C2824]/20'}`}
            />
            <span className={`text-sm font-medium ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>USDT</span>
          </div>
          <div className={`flex justify-between text-[10px] mb-5 ${isDark ? 'text-white/30' : 'text-[#2C2824]/35'}`}>
            <span>{t ? '余额' : 'Balance'}: 5,000 USDT</span>
            <button type="button" className="text-[#C9A96E] font-medium">{t ? '最大' : 'MAX'}</button>
          </div>
          <div className="ios-glass-inset p-3 mb-5 flex justify-between text-xs">
            <span className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'}>{t ? '预计获得' : 'You receive'}</span>
            <span className="font-bold" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>~{depositAmount || '0'} dUSD</span>
          </div>
          <GlassButton variant="primary" className="w-full !py-3.5 !text-sm">{t ? '确认充值' : 'Confirm Deposit'}</GlassButton>
        </div>
      </div>
    );
  }

  if (mode === 'transfer') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#2C2824]/50'}`}>
          ← {t ? '返回 dUSD' : 'Back to dUSD'}
        </button>
        <div className={glassCardClass('accent', 'p-4')}>
          <div className={`text-[11px] leading-relaxed ${isDark ? 'text-[#C9A96E]/80' : 'text-[#6B1A3A]/80'}`}>
            {t
              ? '推荐奖励为下级入金的 30%，全部以 dUSD 入账（用于质押投资，不可提现）。其中 15% 可转让额度仅可转给直推下线。'
              : 'Referral reward is 30% of downline entry, all credited as dUSD for staking/investment — not withdrawable. 15% is transferable to direct downline only.'}
          </div>
        </div>
        <div className={glassCardClass('default', 'p-5')}>
          <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '转让 dUSD 给下线' : 'Transfer dUSD to Downline'}
          </div>
          <div className={`ios-glass-inset p-3 mb-4 flex justify-between text-xs`}>
            <span className={isDark ? 'text-white/40' : 'text-[#2C2824]/40'}>{t ? '可转让余额' : 'Transferable quota'}</span>
            <span className="font-bold text-emerald-500">{transferableLeft} dUSD</span>
          </div>
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '接收地址（直推下线）' : 'Recipient (direct downline)'}</div>
          <input
            type="text"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="0x..."
            className={`w-full ios-glass-inset px-3 py-2.5 text-xs font-mono mb-4 outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#2C2824] placeholder:text-[#2C2824]/25'}`}
          />
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{t ? '转让数量' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-xl font-bold font-heading outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#2C2824] placeholder:text-[#2C2824]/20'}`}
            />
            <span className={`text-sm ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>dUSD</span>
          </div>
          <GlassButton variant="primary" className="w-full !py-3.5 !text-sm flex items-center gap-2">
            <Send size={14} /> {t ? '确认转让' : 'Confirm Transfer'}
          </GlassButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={glassCardClass('highlight', 'p-5 relative overflow-hidden')}>
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A96E]/40 to-transparent" />
        <div className="flex items-center gap-2 mb-2">
          <div className="ios-glass-inset w-9 h-9 flex items-center justify-center text-xs font-bold text-[#C9A96E]">d$</div>
          <div>
            <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>dUSD</div>
            <div className={`text-[10px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>{t ? '质押专用资产' : 'Staking asset'}</div>
          </div>
        </div>
        <div className="text-3xl font-bold font-heading mb-3" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>
          {dUsdAccount.total.toLocaleString()} <span className="text-lg">dUSD</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>{t ? '可用' : 'Available'}</div>
            <div className={`font-semibold mt-0.5 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{dUsdAccount.available}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>{t ? '质押中' : 'Staked'}</div>
            <div className={`font-semibold mt-0.5 flex items-center gap-1 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>
              <Lock size={10} className="text-[#C9A96E]" /> {dUsdAccount.staked}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <GlassButton variant="primary" className="!py-3 !text-xs flex flex-col gap-1.5 h-auto" onClick={() => setMode('deposit')}>
          <ArrowDownToLine size={18} />
          {t ? '充值' : 'Deposit'}
        </GlassButton>
        <GlassButton variant="secondary" className="!py-3 !text-xs flex flex-col gap-1.5 h-auto" onClick={() => setMode('transfer')}>
          <ArrowRightLeft size={18} />
          {t ? '转让' : 'Transfer'}
        </GlassButton>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? 'dUSD 用途' : 'dUSD Usage'}
        </div>
        <ul className={`space-y-2 text-[11px] leading-relaxed ${isDark ? 'text-white/45' : 'text-[#2C2824]/50'}`}>
          <li>· {t ? 'LP 债券 / 销毁债券入场需质押 dUSD（非直接持有 LP 代币）' : 'LP/Burn bond entry requires staking dUSD (not raw LP tokens)'}</li>
          <li>· {t ? '质押 dUSD 后按期限获得 D3 释放与 veD3 权重' : 'Stake dUSD to receive D3 vesting and veD3 weight by lock period'}</li>
          <li>· {t ? '推荐奖励 30%（入金）全部以 dUSD 到账，用于投资质押，不可提现' : 'Referral 30% of entry paid entirely in dUSD for staking — not withdrawable'}</li>
          <li>· {t ? '其中 15% 自留质押，15% 可转让直推下线' : '15% self for staking, 15% transferable to direct downline'}</li>
        </ul>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-[#C9A96E]" />
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
            {t ? '推荐奖励 dUSD（入金 30%）' : 'Referral rewards dUSD (30% of entry)'}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? 'text-white/50' : 'text-[#2C2824]/50'}>
              {t ? `本期累计推荐（Epoch ${referralEpoch.epoch}）` : `Epoch ${referralEpoch.epoch} referral total`}
            </span>
            <span className="font-semibold">{referralEpoch.total} dUSD</span>
          </div>
          <div className={`flex justify-between text-[10px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
            <span>{t ? `已入账 ${referralEpoch.claimed} dUSD` : `${referralEpoch.claimed} dUSD credited`}</span>
            <span>{t ? `待领取 ${referralPending.total} dUSD` : `${referralPending.total} dUSD pending`}</span>
          </div>
          <div className={`text-[10px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>
            {t ? '全部为 dUSD，入账后用于质押投资（非钱包提现）' : 'All dUSD — credits for staking/investment, not wallet withdrawal'}
          </div>
          {referralPending.total > 0 && (
            <GlassButton variant="primary" className="w-full !py-2.5 !text-xs">
              {t ? `领取 ${referralPending.total} dUSD 至余额` : `Credit ${referralPending.total} dUSD to balance`}
            </GlassButton>
          )}
          <div className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>
            {t ? '待领取拆分（各 50%）' : 'Pending split (50% each)'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="ios-glass-inset p-3 text-center">
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>{t ? '自留 dUSD' : 'Self dUSD'}</div>
              <div className="text-sm font-bold mt-1" style={{ color: isDark ? '#C9A96E' : '#6B1A3A' }}>{referralPending.self}</div>
            </div>
            <div className="ios-glass-inset p-3 text-center ring-1 ring-emerald-500/20">
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#2C2824]/30'}`}>{t ? '可转让 dUSD' : 'Transferable dUSD'}</div>
              <div className="text-sm font-bold mt-1 text-emerald-500">{referralPending.transferable}</div>
            </div>
          </div>

          <div className={`rounded-lg p-3 ${isDark ? 'bg-white/[0.03]' : 'bg-[#6B1A3A]/[0.03]'}`}>
            <div className={`text-[10px] font-medium mb-2 ${isDark ? 'text-white/40' : 'text-[#2C2824]/40'}`}>
              {t ? '可转让余额（已入账部分）' : 'Transferable balance (credited)'}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>{t ? '累计额度' : 'Credited'}</div>
                <div className={`font-bold mt-0.5 ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{transferableQuota.credited}</div>
              </div>
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>{t ? '已转让' : 'Transferred'}</div>
                <div className="font-bold mt-0.5">{transferableQuota.used}</div>
              </div>
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#2C2824]/30'}>{t ? '剩余可转' : 'Remaining'}</div>
                <div className="font-bold mt-0.5 text-emerald-500">{transferableLeft}</div>
              </div>
            </div>
          </div>
          <GlassButton variant="secondary" className="w-full !py-2.5 !text-xs" onClick={() => setMode('transfer')}>
            {t ? '转让给下线' : 'Transfer to Downline'}
          </GlassButton>
        </div>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#2C2824]/40'}`}>
          {t ? '质押中的 dUSD' : 'Staked dUSD'}
        </div>
        <div className="space-y-2">
          {[
            { type: t ? 'LP 债券质押' : 'LP Bond Stake', amount: '1,200 dUSD', lock: '180d', status: t ? '释放中' : 'Vesting' },
            { type: t ? 'LP 债券质押' : 'LP Bond Stake', amount: '800 dUSD', lock: '360d', status: t ? '释放中' : 'Vesting' },
          ].map((pos, i) => (
            <div key={i} className="ios-glass-inset p-3 flex items-center justify-between">
              <div>
                <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#2C2824]'}`}>{pos.type}</div>
                <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#2C2824]/35'}`}>{pos.lock} · {pos.status}</div>
              </div>
              <span className={`text-xs font-semibold ${isDark ? 'text-[#C9A96E]' : 'text-[#6B1A3A]'}`}>{pos.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
