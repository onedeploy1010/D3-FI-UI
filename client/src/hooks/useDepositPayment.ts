import { useCallback, useState } from 'react';
import { useDepositAddress, useFundWallet, useWallets } from '@privy-io/react-auth';
import type { Hex } from 'viem';
import { useWallet } from '@/contexts/WalletContext';
import { d3DefaultChain } from '@/lib/chains';
import {
  createPartnerJoinIntent,
  createStakeIntent,
  demoCreditDeposit,
  reportDepositTx,
  waitForDepositCredited,
  type DepositIntent,
} from '@/lib/depositApi';
import { BSC_CAIP2, BSC_USDT_ADDRESS, type PartnerPaymentMethod, payToDepositAddress } from '@/lib/partnerDepositPay';
import { resolvePrimaryWallet } from '@/lib/privyWallet';

export type DepositPaymentResult = {
  intent: DepositIntent;
  txHash: string | null;
  method: PartnerPaymentMethod;
};

function fiatFundOptions(amountUsdt: number) {
  return {
    chain: d3DefaultChain,
    amount: String(amountUsdt),
    asset: { erc20: BSC_USDT_ADDRESS as Hex },
    defaultFundingMethod: 'card' as const,
    card: { preferredProvider: 'moonpay' as const },
  };
}

export function useDepositPayment(wallet: string | null) {
  const { isDemo } = useWallet();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const { createDepositAddress } = useDepositAddress();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIntent, setLastIntent] = useState<DepositIntent | null>(null);

  const executePayment = useCallback(
    async (
      w: string,
      createIntent: () => Promise<DepositIntent>,
      amountUsdt: number,
      method: PartnerPaymentMethod,
    ): Promise<DepositPaymentResult> => {
      setPaying(true);
      setError(null);
      try {
        const intent = await createIntent();
        setLastIntent(intent);

        if (isDemo) {
          await demoCreditDeposit(w, intent.intentId);
          await waitForDepositCredited(w, intent.intentId, { maxAttempts: 3, intervalMs: 500 });
          return { intent, txHash: null, method };
        }

        const depositAddress = intent.depositAddress;
        let txHash: string | null = null;

        if (method === 'wallet') {
          const connected = resolvePrimaryWallet(wallets);
          const result = await payToDepositAddress({
            amountUsdt,
            depositAddress,
            isDemo: false,
            wallet: connected,
          });
          txHash = result.txHash;
          if (txHash) {
            await reportDepositTx(w, intent.intentId, txHash);
          }
        } else if (method === 'fiat') {
          const result = await fundWallet({ address: depositAddress, options: fiatFundOptions(amountUsdt) });
          if (result.status === 'cancelled') throw new Error('已取消支付');
          txHash = result.transactionHash ?? null;
        } else {
          await createDepositAddress({
            destinationChain: BSC_CAIP2,
            destinationCurrency: BSC_USDT_ADDRESS,
            destinationAddress: depositAddress,
          });
        }

        await waitForDepositCredited(w, intent.intentId);
        return { intent, txHash, method };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setPaying(false);
      }
    },
    [isDemo, wallets, fundWallet, createDepositAddress],
  );

  const payForJoin = useCallback(
    (amountUsdt: number, method: PartnerPaymentMethod = 'wallet') => {
      if (!wallet) throw new Error('请先连接钱包');
      return executePayment(wallet, () => createPartnerJoinIntent(wallet, amountUsdt), amountUsdt, method);
    },
    [wallet, executePayment],
  );

  const payForStake = useCallback(
    (amountUsdt: number, method: PartnerPaymentMethod = 'wallet') => {
      if (!wallet) throw new Error('请先连接钱包');
      return executePayment(wallet, () => createStakeIntent(wallet, amountUsdt), amountUsdt, method);
    },
    [wallet, executePayment],
  );

  return {
    payForJoin,
    payForStake,
    paying,
    error,
    lastIntent,
    clearError: () => setError(null),
  };
}

export type { PartnerPaymentMethod };
