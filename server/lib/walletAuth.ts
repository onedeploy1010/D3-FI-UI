const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isEthAddress(value: string): boolean {
  return ETH_ADDRESS_RE.test(value.trim());
}

export function walletEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function shortWallet(address: string): string {
  const w = address.trim();
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export function getWalletFromRequest(req: { headers: Record<string, string | string[] | undefined>; params?: Record<string, string>; body?: Record<string, unknown> }): string | null {
  const header = req.headers['x-wallet-address'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromParam = req.params?.wallet;
  const fromBody = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress : null;
  const raw = fromHeader ?? fromParam ?? fromBody;
  if (!raw || !isEthAddress(raw)) return null;
  return raw.trim();
}

export function requireWallet(req: { headers: Record<string, string | string[] | undefined>; params?: Record<string, string>; body?: Record<string, unknown> }): string {
  const wallet = getWalletFromRequest(req);
  if (!wallet) throw new Error('WALLET_REQUIRED');
  return wallet;
}
