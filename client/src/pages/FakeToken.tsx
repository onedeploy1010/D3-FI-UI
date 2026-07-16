import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useWallet } from '@/contexts/wallet-context';
import { getConnectedWalletClient } from '@/lib/wagmiWallet';
import { claimTestUsdt, getFaucetStatus, type FaucetStatus } from '@/lib/faucet';
import { BSC_USDT_ADDRESS, USDT_IS_FAUCET } from '@/lib/tokens';
import { shortWallet } from '@/lib/wallet';

function fmtCooldown(sec: number): string {
  if (sec <= 0) return '可领取';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}小时${m}分后可再领`;
}

export default function FakeToken() {
  const { wallet, isConnected, connect } = useWallet();

  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      setStatus(await getFaucetStatus(wallet));
    } catch (e) {
      setMsg({ kind: 'err', text: `读取余额失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onClaim = useCallback(async () => {
    if (!wallet) return;
    const walletClient = await getConnectedWalletClient();
    if (!walletClient) {
      setMsg({ kind: 'err', text: '未找到可签名的钱包，请重新连接。' });
      return;
    }
    setClaiming(true);
    setMsg({ kind: 'info', text: '正在提交领取交易，请在钱包中确认…' });
    try {
      const txHash = await claimTestUsdt(walletClient);
      setMsg({ kind: 'ok', text: `领取成功！交易：${shortWallet(txHash)}。约 5 秒后余额刷新。` });
      setTimeout(() => void refresh(), 5000);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({
        kind: 'err',
        text: /cooldown/i.test(text)
          ? '还在冷却期，请稍后再领。'
          : /rejected|denied/i.test(text)
            ? '你取消了交易。'
            : `领取失败：${text}`,
      });
    } finally {
      setClaiming(false);
    }
  }, [wallet, refresh]);

  const canClaim = !!status && status.claimableInSec <= 0 && !claiming;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">测试 USDT 水龙头</h1>
          <p className="text-sm text-neutral-400">
            领取测试 USDT,用于在 BSC 上体验质押与闪兑流程(非真实资产)。
          </p>
        </header>

        {!USDT_IS_FAUCET && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 p-4 text-sm text-amber-200">
            当前环境未启用测试币水龙头(<code>VITE_USDT_IS_FAUCET</code> 未开)。
            此页仅在配置了测试代币时可用。
          </div>
        )}

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">代币合约</span>
            <a
              className="font-mono text-xs text-sky-400 hover:underline"
              href={`https://bscscan.com/address/${BSC_USDT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortWallet(BSC_USDT_ADDRESS)}
            </a>
          </div>

          {!isConnected ? (
            <button
              onClick={connect}
              className="w-full rounded-lg bg-sky-600 py-3 font-medium hover:bg-sky-500 transition"
            >
              连接钱包
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">钱包</span>
                <span className="font-mono text-xs">{shortWallet(wallet ?? '')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400 text-sm">当前余额</span>
                <span className="text-lg font-semibold">
                  {loading ? '…' : (status?.balance ?? 0).toLocaleString()} USDT
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-400">单次领取</span>
                <span>{status ? status.faucetAmount.toLocaleString() : '—'} USDT</span>
              </div>

              <button
                onClick={onClaim}
                disabled={!canClaim || !USDT_IS_FAUCET}
                className="w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {claiming
                  ? '领取中…'
                  : status && status.claimableInSec > 0
                    ? fmtCooldown(status.claimableInSec)
                    : '领取测试 USDT'}
              </button>
            </>
          )}

          {msg && (
            <div
              className={
                'rounded-lg p-3 text-sm ' +
                (msg.kind === 'ok'
                  ? 'bg-emerald-950/50 text-emerald-200 border border-emerald-800/50'
                  : msg.kind === 'err'
                    ? 'bg-red-950/50 text-red-200 border border-red-800/50'
                    : 'bg-sky-950/50 text-sky-200 border border-sky-800/50')
              }
            >
              {msg.text}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
          <h2 className="text-sm font-medium text-neutral-300">下一步：用测试币质押</h2>
          <p className="text-xs text-neutral-500">
            领到测试 USDT 后,前往合伙人/众筹页发起质押,系统会给你一个存款地址,把测试 USDT 打过去即可入场(540 天,每日释放 D3)。
          </p>
          <div className="flex gap-3">
            <Link
              href="/partner"
              className="flex-1 text-center rounded-lg border border-neutral-700 py-2 text-sm hover:bg-neutral-800 transition"
            >
              前往合伙人
            </Link>
            <Link
              href="/d3fi"
              className="flex-1 text-center rounded-lg border border-neutral-700 py-2 text-sm hover:bg-neutral-800 transition"
            >
              前往 D3Fi
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
