import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useWallet } from '@/contexts/wallet-context';
import {
  createPartnerJoinIntent,
  createStakeIntent,
  demoCreditDeposit,
  reportDepositTx,
  waitForDepositCredited,
  type DepositIntent,
} from '@/lib/depositApi';
import { payToDepositAddress } from '@/lib/partnerDepositPay';
import { resolvePrimaryWallet } from '@/lib/privyWallet';

export type DepositPaymentResult = {
  intent: DepositIntent;
  txHash: string | null;
};

export function useDepositPayment(wallet: string | null) {
  const { isDemo } = useWallet();
  const { wallets } = useWallets();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIntent, setLastIntent] = useState<DepositIntent | null>(null);

  const executePayment = useCallback(
    async (
      w: string,
      createIntent: () => Promise<DepositIntent>,
      amountUsdt: number,
    ): Promise<DepositPaymentResult> => {
      setPaying(true);
      setError(null);
      try {
        const intent = await createIntent();
        setLastIntent(intent);

        if (isDemo) {
          await demoCreditDeposit(w, intent.intentId);
          await waitForDepositCredited(w, intent.intentId, { maxAttempts: 3, intervalMs: 500 });
          return { intent, txHash: null };
        }

        const connected = resolvePrimaryWallet(wallets);
        const { txHash } = await payToDepositAddress({
          amountUsdt,
          depositAddress: intent.depositAddress,
          isDemo: false,
          wallet: connected,
        });

        if (txHash) {
          await reportDepositTx(w, intent.intentId, txHash);
        }

        await waitForDepositCredited(w, intent.intentId);
        return { intent, txHash };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setPaying(false);
      }
    },
    [isDemo, wallets],
  );

  const payForJoin = useCallback(
    (amountUsdt: number) => {
      if (!wallet) throw new Error('请先连接钱包');
      return executePayment(wallet, () => createPartnerJoinIntent(wallet, amountUsdt), amountUsdt);
    },
    [wallet, executePayment],
  );

  const payForStake = useCallback(
    (amountUsdt: number) => {
      if (!wallet) throw new Error('请先连接钱包');
      return executePayment(wallet, () => createStakeIntent(wallet, amountUsdt), amountUsdt);
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
