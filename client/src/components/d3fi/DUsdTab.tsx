import { useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, Lock, Send, Info } from 'lucide-react';
import { glassCardClass, GlassButton } from '@/components/ui/GlassSurface';
import type { D3FiViewModel } from '@/lib/d3fiViewModel';
import { claimUsd3 } from '@/lib/unionApi';
import { fmtNum } from '@/lib/d3fiViewModel';

type Lang = 'zh' | 'en';

export function DUsdTab({
  lang,
  isDark,
  vm,
  isLoading,
  onClaim,
  wallet,
}: {
  lang: Lang;
  isDark: boolean;
  vm: D3FiViewModel | null;
  isLoading?: boolean;
  onClaim?: () => void;
  wallet?: string | null;
}) {
  const t = lang === 'zh';
  const [mode, setMode] = useState<'overview' | 'deposit' | 'transfer'>('overview');
  const [depositAmount, setDepositAmount] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferTo, setTransferTo] = useState('');

  const usd3 = vm?.usd3 ?? { total: 0, available: 0, staked: 0, transferable: 0, pending: 0, selfPool: 0, downlinePool: 0 };
  const pending = vm?.pendingReferral ?? { total: 0, self: 0, transferable: 0, epoch: '—' };
  const transferableQuota = vm?.transferableQuota ?? { credited: 0, used: 0, remaining: 0 };
  const transferableLeft = transferableQuota.remaining;
  const stakedPositions = (vm?.positions ?? []).filter((p) => p.type.toLowerCase().includes('lp') || p.amount.includes('UD3'));

  const handleClaim = async () => {
    if (!wallet || pending.total <= 0) return;
    await claimUsd3(wallet);
    onClaim?.();
  };

  if (mode === 'deposit') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          ← {t ? '返回 UD3' : 'Back to UD3'}
        </button>
        <div className={glassCardClass('default', 'p-5')}>
          <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
            {t ? '充值 UD3' : 'Deposit UD3'}
          </div>
          <p className={`text-[11px] mb-4 leading-relaxed ${isDark ? 'text-white/40' : 'text-[#160510]/45'}`}>
            {t ? '使用 USDT 按 1:1 铸造 UD3。UD3 是协议内质押与团队奖励的专用资产，不可直接在 DEX 交易。' : 'Mint UD3 1:1 with USDT. UD3 is used for staking and team rewards; not tradable on DEX.'}
          </p>
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? '充值金额' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="text"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-2xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <span className={`text-sm font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>USDT</span>
          </div>
          <div className={`flex justify-between text-[10px] mb-5 ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
            <span>{t ? '余额' : 'Balance'}: 5,000 USDT</span>
            <button type="button" className="text-[#E0568F] font-medium">{t ? '最大' : 'MAX'}</button>
          </div>
          <div className="ios-glass-inset p-3 mb-5 flex justify-between text-xs">
            <span className={isDark ? 'text-white/40' : 'text-[#160510]/40'}>{t ? '预计获得' : 'You receive'}</span>
            <span className="font-bold" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>~{depositAmount || '0'} UD3</span>
          </div>
          <GlassButton variant="primary" className="w-full !py-3.5 !text-sm">{t ? '确认充值' : 'Confirm Deposit'}</GlassButton>
        </div>
      </div>
    );
  }

  if (mode === 'transfer') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setMode('overview')} className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-[#160510]/50'}`}>
          ← {t ? '返回 UD3' : 'Back to UD3'}
        </button>
        <div className={glassCardClass('accent', 'p-4')}>
          <div className={`text-[11px] leading-relaxed ${isDark ? 'text-[#E0568F]/80' : 'text-[#8A2B57]/80'}`}>
            {t
              ? '推荐奖励为下级入金的 30%，全部以 UD3 入账（用于质押投资，不可提现）。其中 15% 可转让额度仅可转给直推下线。'
              : 'Referral reward is 30% of downline entry, all credited as UD3 for staking/investment — not withdrawable. 15% is transferable to direct downline only.'}
          </div>
        </div>
        <div className={glassCardClass('default', 'p-5')}>
          <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
            {t ? '转让 UD3 给下线' : 'Transfer UD3 to Downline'}
          </div>
          <div className={`ios-glass-inset p-3 mb-4 flex justify-between text-xs`}>
            <span className={isDark ? 'text-white/40' : 'text-[#160510]/40'}>{t ? '可转让余额' : 'Transferable quota'}</span>
            <span className="font-bold text-emerald-500">{transferableLeft} UD3</span>
          </div>
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? '接收地址（直推下线）' : 'Recipient (direct downline)'}</div>
          <input
            type="text"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            placeholder="0x..."
            className={`w-full ios-glass-inset px-3 py-2.5 text-xs font-mono mb-4 outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/25'}`}
          />
          <div className={`text-[10px] mb-2 ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{t ? '转让数量' : 'Amount'}</div>
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="0.00"
              className={`flex-1 bg-transparent text-xl font-bold font-stat outline-none ${isDark ? 'text-white placeholder:text-white/20' : 'text-[#160510] placeholder:text-[#160510]/20'}`}
            />
            <span className={`text-sm ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>UD3</span>
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
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#E0568F]/40 to-transparent" />
        <div className="flex items-center gap-2 mb-2">
          <div className="ios-glass-inset w-9 h-9 flex items-center justify-center text-xs font-bold text-[#E0568F]">d$</div>
          <div>
            <div className={`text-[10px] ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>UD3</div>
            <div className={`text-[10px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{t ? '质押专用资产' : 'Staking asset'}</div>
          </div>
        </div>
        <div className="site-stat-value-lg site-stat-value-accent mb-3">
          {fmtNum(usd3.total)} <span className="text-lg font-heading">UD3</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '可用' : 'Available'}</div>
            <div className={`font-semibold mt-0.5 ${isDark ? 'text-white' : 'text-[#160510]'}`}>{fmtNum(usd3.available)}</div>
          </div>
          <div className="ios-glass-inset p-2.5">
            <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '质押中' : 'Staked'}</div>
            <div className={`font-semibold mt-0.5 flex items-center gap-1 ${isDark ? 'text-white' : 'text-[#160510]'}`}>
              <Lock size={10} className="text-[#E0568F]" /> {fmtNum(usd3.staked)}
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
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? 'UD3 用途' : 'UD3 Usage'}
        </div>
        <ul className={`space-y-2 text-[11px] leading-relaxed ${isDark ? 'text-white/45' : 'text-[#160510]/50'}`}>
          <li>· {t ? 'LP 债券 / 销毁债券入场需质押 UD3（非直接持有 LP 代币）' : 'LP/Burn bond entry requires staking UD3 (not raw LP tokens)'}</li>
          <li>· {t ? '质押 UD3 后按期限获得 D3 释放与 veD3 权重' : 'Stake UD3 to receive D3 vesting and veD3 weight by lock period'}</li>
          <li>· {t ? '推荐奖励 30%（入金）全部以 UD3 到账，用于投资质押，不可提现' : 'Referral 30% of entry paid entirely in UD3 for staking — not withdrawable'}</li>
          <li>· {t ? '其中 15% 自留质押，15% 可转让直推下线' : '15% self for staking, 15% transferable to direct downline'}</li>
        </ul>
      </div>

      <div className={glassCardClass('default', 'p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-[#E0568F]" />
          <div className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
            {t ? '推荐奖励 UD3（入金 30%）' : 'Referral rewards UD3 (30% of entry)'}
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className={isDark ? 'text-white/50' : 'text-[#160510]/50'}>
              {t ? `本期累计推荐（Epoch ${pending.epoch}）` : `Epoch ${pending.epoch} referral total`}
            </span>
            <span className="font-semibold">{fmtNum(vm?.cumulativeReferralUsd3 ?? 0)} UD3</span>
          </div>
          <div className={`flex justify-between text-[10px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>
            <span>{t ? `已入账 ${fmtNum(vm?.cumulativeReferralUsd3 ?? 0)} UD3` : `${fmtNum(vm?.cumulativeReferralUsd3 ?? 0)} UD3 credited`}</span>
            <span>{t ? `待领取 ${pending.total} UD3` : `${pending.total} UD3 pending`}</span>
          </div>
          <div className={`text-[10px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>
            {t ? '全部为 UD3，入账后用于质押投资（非钱包提现）' : 'All UD3 — credits for staking/investment, not wallet withdrawal'}
          </div>
          {pending.total > 0 && (
            <GlassButton variant="primary" className="w-full !py-2.5 !text-xs" onClick={() => void handleClaim()}>
              {t ? `领取 ${pending.total} UD3 至余额` : `Credit ${pending.total} UD3 to balance`}
            </GlassButton>
          )}
          <div className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
            {t ? '待领取拆分（各 50%）' : 'Pending split (50% each)'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="ios-glass-inset p-3 text-center">
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{t ? '自留 UD3' : 'Self UD3'}</div>
              <div className="text-sm font-bold mt-1" style={{ color: isDark ? '#E0568F' : '#8A2B57' }}>{pending.self}</div>
            </div>
            <div className="ios-glass-inset p-3 text-center ring-1 ring-emerald-500/20">
              <div className={`text-[9px] ${isDark ? 'text-white/30' : 'text-[#160510]/30'}`}>{t ? '可转让 UD3' : 'Transferable UD3'}</div>
              <div className="text-sm font-bold mt-1 text-emerald-500">{pending.transferable}</div>
            </div>
          </div>

          <div className={`rounded-lg p-3 ${isDark ? 'bg-white/[0.03]' : 'bg-[#8A2B57]/[0.03]'}`}>
            <div className={`text-[10px] font-medium mb-2 ${isDark ? 'text-white/40' : 'text-[#160510]/40'}`}>
              {t ? '可转让余额（已入账部分）' : 'Transferable balance (credited)'}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '累计额度' : 'Credited'}</div>
                <div className={`font-bold mt-0.5 ${isDark ? 'text-white' : 'text-[#160510]'}`}>{transferableQuota.credited}</div>
              </div>
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '已转让' : 'Transferred'}</div>
                <div className="font-bold mt-0.5">{transferableQuota.used}</div>
              </div>
              <div>
                <div className={isDark ? 'text-white/30' : 'text-[#160510]/30'}>{t ? '剩余可转' : 'Remaining'}</div>
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
        <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-[#160510]/40'}`}>
          {t ? '质押中的 UD3' : 'Staked UD3'}
        </div>
        <div className="space-y-2">
          {stakedPositions.length === 0 ? (
            <div className={`text-xs py-4 text-center ${isDark ? 'text-white/30' : 'text-[#160510]/35'}`}>
              {isLoading ? (t ? '加载中…' : 'Loading…') : (t ? '暂无质押仓位' : 'No staked positions')}
            </div>
          ) : (
            stakedPositions.map((pos, i) => (
              <div key={i} className="ios-glass-inset p-3 flex items-center justify-between">
                <div>
                  <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-[#160510]'}`}>{pos.type}</div>
                  <div className={`text-[10px] ${isDark ? 'text-white/35' : 'text-[#160510]/35'}`}>{pos.remaining}</div>
                </div>
                <span className={`text-xs font-semibold ${isDark ? 'text-[#E0568F]' : 'text-[#8A2B57]'}`}>{pos.amount}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
