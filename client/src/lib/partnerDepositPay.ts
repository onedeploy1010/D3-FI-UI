import type { ConnectedWallet } from '@privy-io/react-auth';
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { bscPublicClient, d3DefaultChain } from '@/lib/chains';
import { PartnerPaymentError } from '@/lib/partnerPaymentErrors';
import { shortWallet } from '@/lib/wallet';

/** BSC USDT (BEP-20) — 18 decimals on BSC */
export const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;
const BSC_USDT_DECIMALS = 18;
const ERC20_TRANSFER_GAS_FALLBACK = 120_000n;
const GAS_BUFFER_NUM = 130n;
const GAS_BUFFER_DEN = 100n;

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

function parseUsdtAmountSafe(amountUsdt: number): bigint {
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
    throw new PartnerPaymentError({ code: 'invalid_amount' });
  }
  const normalized = amountUsdt.toFixed(8).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return parseUnits(normalized, BSC_USDT_DECIMALS);
}

function mapPaymentError(e: unknown, payer: string): PartnerPaymentError {
  if (e instanceof PartnerPaymentError) return e;

  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  const wallet = shortWallet(payer);

  if (
    lower.includes('transfer amount exceeds') ||
    lower.includes('exceeds balance') ||
    lower.includes('erc20: transfer amount exceeds balance')
  ) {
    return new PartnerPaymentError({
      code: 'usdt_insufficient',
      required: '—',
      balance: '—',
      wallet,
    });
  }
  if (
    lower.includes('insufficient funds') ||
    lower.includes('gas required exceeds') ||
    (lower.includes('gas') && lower.includes('low'))
  ) {
    return new PartnerPaymentError({
      code: 'gas_insufficient',
      required: '—',
      balance: '—',
      wallet,
    });
  }
  if (lower.includes('user rejected') || lower.includes('denied') || lower.includes('rejected')) {
    return new PartnerPaymentError({ code: 'user_rejected' });
  }
  if (lower.includes('chain') && lower.includes('mismatch')) {
    return new PartnerPaymentError({ code: 'wrong_chain' });
  }

  return new PartnerPaymentError({ code: 'generic', message: msg });
}

async function assertPaymentReady(account: Address, amountWei: bigint, data: Hex) {
  const [bnbBalance, usdtBalance, gasPrice] = await Promise.all([
    bscPublicClient.getBalance({ address: account }),
    bscPublicClient.readContract({
      address: BSC_USDT_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    }),
    bscPublicClient.getGasPrice(),
  ]);

  const amountLabel = formatUnits(amountWei, BSC_USDT_DECIMALS);
  const balanceLabel = formatUnits(usdtBalance, BSC_USDT_DECIMALS);
  const wallet = shortWallet(account);

  if (usdtBalance < amountWei) {
    throw new PartnerPaymentError({
      code: 'usdt_insufficient',
      required: amountLabel,
      balance: balanceLabel,
      wallet,
    });
  }

  let gasLimit = ERC20_TRANSFER_GAS_FALLBACK;
  try {
    gasLimit = await bscPublicClient.estimateGas({
      account,
      to: BSC_USDT_ADDRESS,
      data,
    });
  } catch {
    // Fall back when RPC cannot simulate (e.g. wallet not yet on BSC).
  }

  gasLimit = (gasLimit * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
  const gasCost = gasLimit * gasPrice;

  if (bnbBalance < gasCost) {
    throw new PartnerPaymentError({
      code: 'gas_insufficient',
      required: formatEther(gasCost),
      balance: formatEther(bnbBalance),
      wallet,
    });
  }

  return { gasLimit, gasPrice };
}

async function sendUsdt(
  wallet: ConnectedWallet,
  amountUsdt: number,
  toAddress: string,
): Promise<string> {
  const account = wallet.address as Address;
  const amountWei = parseUsdtAmountSafe(amountUsdt);
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [toAddress as Address, amountWei],
  });

  await wallet.switchChain(d3DefaultChain.id);
  const { gasLimit, gasPrice } = await assertPaymentReady(account, amountWei, data);

  const provider = await wallet.getEthereumProvider();
  const walletClient = createWalletClient({
    account,
    chain: d3DefaultChain,
    transport: custom(provider),
  });

  try {
    return await walletClient.sendTransaction({
      to: BSC_USDT_ADDRESS,
      data,
      chain: d3DefaultChain,
      gas: gasLimit,
      gasPrice,
    });
  } catch (e) {
    throw mapPaymentError(e, account);
  }
}

/** Pay USDT to a user-specific deposit address (never treasury). */
export async function payToDepositAddress(opts: {
  amountUsdt: number;
  depositAddress: string;
  isDemo: boolean;
  wallet: ConnectedWallet | null;
}): Promise<{ txHash: string | null }> {
  if (opts.isDemo) {
    return { txHash: null };
  }
  if (!opts.wallet) {
    throw new PartnerPaymentError({ code: 'wallet_required' });
  }
  const txHash = await sendUsdt(opts.wallet, opts.amountUsdt, opts.depositAddress);
  return { txHash };
}
