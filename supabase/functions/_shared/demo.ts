import { walletEquals } from './wallet.ts';

export const DEMO_WALLET_ADDRESS =
  Deno.env.get('DEMO_WALLET_ADDRESS') ?? '0x1234567890AbCdEf1234567890AbCdEf1234567890';

/** Demo reads/writes for the seeded line-leader wallet without Privy JWT. */
export function isDemoModeRequest(req: Request): boolean {
  if (Deno.env.get('DEMO_MODE_ENABLED') === 'false') return false;
  if (req.headers.get('x-demo-mode') !== '1') return false;
  const wallet = req.headers.get('x-wallet-address')?.trim();
  if (!wallet) return false;
  return walletEquals(wallet, DEMO_WALLET_ADDRESS);
}
