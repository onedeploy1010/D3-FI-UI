import { useCallback, useState } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import {
  createPartnerJoinIntent,
  createStakeIntent,
  reportDepositTx,
  waitForDepositCredited,
  type DepositIntent,
} from '@/lib/depositApi';
import { payToDepositAddress } from '@/lib/partnerDepositPay';
import { PartnerPaymentError } from '@/lib/partnerPaymentErrors';
import { getConnectedWalletClient } from '@/lib/wagmiWallet';

export type DepositPaymentResult = {
  intent: DepositIntent;
  txHash: string | null;
};

export function useDepositPayment(wallet: string | null) {
  const { isDemo } = useWallet();
  const [paying, setPaying] = useState(false);
  const [lastIntent, setLastIntent] = useState<DepositIntent | null>(null);

  const executePayment = useCallback(
    async (
      w: string,
      createIntent: () => Promise<DepositIntent>,
      amountUsdt: number,
    ): Promise<DepositPaymentResult> => {
      setPaying(true);
      try {
        if (isDemo) {
          await new Promise((r) => setTimeout(r, 350));
          const mockIntent: DepositIntent = {
            intentId: `demo-mock-${Date.now()}`,
            depositAddress: '0x0000000000000000000000000000000000000000',
            shortAddress: '0x0000…0000',
            chainId: 56,
            chainName: 'BSC',
            tokenSymbol: 'USDT',
            tokenContract: '0x55d398326f99059fF775485246999027B3197955',
            expectedAmount: String(amountUsdt),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            status: 'credited',
          };
          setLastIntent(mockIntent);
          return { intent: mockIntent, txHash: null };
        }

        const intent = await createIntent();
        setLastIntent(intent);

        const walletClient = await getConnectedWalletClient();
        if (!walletClient) {
          throw new PartnerPaymentError({ code: 'no_wallet' });
        }
        const { txHash } = await payToDepositAddress({
          amountUsdt,
          depositAddress: intent.depositAddress,
          isDemo: false,
          wallet: walletClient,
        });

        if (txHash) {
          await reportDepositTx(w, intent.intentId, txHash);
        }

        await waitForDepositCredited(w, intent.intentId);
        return { intent, txHash };
      } finally {
        setPaying(false);
      }
    },
    [isDemo],
  );

  const payForJoin = useCallback(
    (amountUsdt: number) => {
      if (!wallet) throw new PartnerPaymentError({ code: 'wallet_required' });
      return executePayment(wallet, () => createPartnerJoinIntent(wallet, amountUsdt), amountUsdt);
    },
    [wallet, executePayment],
  );

  const payForStake = useCallback(
    (amountUsdt: number) => {
      if (!wallet) throw new PartnerPaymentError({ code: 'wallet_required' });
      return executePayment(wallet, () => createStakeIntent(wallet, amountUsdt), amountUsdt);
    },
    [wallet, executePayment],
  );

  return {
    payForJoin,
    payForStake,
    paying,
    lastIntent,
  };
}
