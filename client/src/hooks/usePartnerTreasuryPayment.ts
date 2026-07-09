import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useWallet } from '@/contexts/WalletContext';
import type { PartnerTreasury } from '@/lib/partnerApi';
import { payPartnerTreasury } from '@/lib/partnerTreasuryPay';

export function usePartnerTreasuryPayment(treasury: PartnerTreasury | null) {
  const { isDemo } = useWallet();
  const { wallets } = useWallets();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payToTreasury = useCallback(
    async (amountUsdt: number) => {
      setPaying(true);
      setError(null);
      try {
        const connected = isDemo ? null : (wallets[0] ?? null);
        return await payPartnerTreasury({
          amountUsdt,
          treasuryAddress: treasury?.treasuryAddress ?? null,
          isDemo,
          wallet: connected,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setPaying(false);
      }
    },
    [treasury?.treasuryAddress, isDemo, wallets],
  );

  return { payToTreasury, paying, error, clearError: () => setError(null) };
}
