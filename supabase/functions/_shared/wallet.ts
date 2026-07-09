const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isEthAddress(value: string): boolean {
  return ETH_ADDRESS_RE.test(value.trim());
}

export function formatWalletAddress(address: string): string {
  const trimmed = address.trim();
  if (!isEthAddress(trimmed)) throw new Error('Invalid Ethereum address');
  return trimmed;
}

export function walletEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function shortWallet(address: string): string {
  const w = address.trim();
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export function getWalletHeader(req: Request): string | null {
  const raw = req.headers.get('x-wallet-address')?.trim();
  if (!raw || !isEthAddress(raw)) return null;
  return raw;
}

export function requireWallet(req: Request): string {
  const wallet = getWalletHeader(req);
  if (!wallet) throw new HttpError(400, 'X-Wallet-Address header required');
  return wallet;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}
