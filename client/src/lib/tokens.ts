/**
 * Settlement token config (frontend). Defaults to real BSC USDT; set
 * VITE_BSC_USDT_ADDRESS to a fake/faucet token for staging so the deposit/stake
 * flow runs against test funds. When VITE_USDT_IS_FAUCET=true the /faketoken
 * claim page is enabled (the token exposes a public claim()).
 */
const MAINNET_USDT = '0x55d398326f99059fF775485246999027B3197955';

export const BSC_USDT_ADDRESS = (import.meta.env.VITE_BSC_USDT_ADDRESS?.trim() ||
  MAINNET_USDT) as `0x${string}`;

export const BSC_USDT_DECIMALS = 18;

/** True when the configured USDT is a faucet test token (enables /faketoken). */
export const USDT_IS_FAUCET =
  String(import.meta.env.VITE_USDT_IS_FAUCET ?? '').toLowerCase() === 'true';
