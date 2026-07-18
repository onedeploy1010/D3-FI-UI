import { ApiKeyStamper } from 'https://esm.sh/@turnkey/api-key-stamper@0.4.4';
import { mnemonicToAccount } from 'npm:viem@2/accounts';
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  parseAbiItem,
  parseUnits,
  serializeTransaction,
  type Address,
  type Hash,
  type Hex,
} from 'npm:viem@2';
import { bsc } from 'npm:viem/chains';
import {
  BSC_CHAIN_ID,
  BSC_MIN_CONFIRMATIONS,
  BSC_USDT_CONTRACT,
  BSC_USDT_DECIMALS,
} from './tokens.ts';
import { HttpError } from './wallet.ts';

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const erc20Abi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
const erc20BalanceAbi = parseAbi(['function balanceOf(address account) view returns (uint256)']);

const MIN_GAS_BALANCE_WEI = 500_000_000_000_000n; // 0.0005 BNB — enough for one BSC ERC20 transfer
const GAS_TOP_UP_WEI = 500_000_000_000_000n; // 0.0005 BNB per top-up

export function isTurnkeyConfigured(): boolean {
  return Boolean(
    Deno.env.get('TURNKEY_ORGANIZATION_ID') &&
      Deno.env.get('TURNKEY_API_PUBLIC_KEY') &&
      Deno.env.get('TURNKEY_API_PRIVATE_KEY'),
  );
}

/** Dev / staging fallback when Turnkey is not yet configured. */
export function devMnemonic(): string | null {
  return Deno.env.get('TREASURY_DEV_MNEMONIC') ?? null;
}

export type CreatedDepositWallet = {
  turnkeyWalletId: string;
  turnkeyWalletAccountId: string | null;
  address: string;
  provider: 'turnkey' | 'dev_hd';
  hdIndex?: number;
};

export type DerivedDepositAccount = {
  address: string;
  derivationIndex: number;
  path: string;
  turnkeyWalletId: string;
  provider: 'turnkey' | 'dev_hd';
};

export function depositDerivationPath(index: number): string {
  return `m/44'/60'/0'/0/${index}`;
}

const evmAccountTemplate = {
  curve: 'CURVE_SECP256K1',
  pathFormat: 'PATH_FORMAT_BIP32',
  addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
} as const;

async function stampAndSend(
  segment: 'submit' | 'query',
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const apiPublicKey = Deno.env.get('TURNKEY_API_PUBLIC_KEY')!;
  const apiPrivateKey = Deno.env.get('TURNKEY_API_PRIVATE_KEY')!;
  const bodyStr = JSON.stringify(body);
  const stamper = new ApiKeyStamper({ apiPublicKey, apiPrivateKey });
  const { stampHeaderValue } = await stamper.stamp(bodyStr);

  const res = await fetch(`https://api.turnkey.com/public/v1/${segment}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stamp': stampHeaderValue,
    },
    body: bodyStr,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { message?: string }).message ?? `Turnkey ${path} failed (${res.status})`,
    );
  }
  return json;
}

function stampAndPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  return stampAndSend('submit', path, body);
}

function stampAndQuery(path: string, body: Record<string, unknown>): Promise<unknown> {
  return stampAndSend('query', path, body);
}

export function getActivityEnvelope(json: unknown): {
  activityId?: string;
  status?: string;
  failure?: string;
  resultBag?: Record<string, unknown>;
} {
  const root = json as {
    activity?: {
      id?: string;
      status?: string;
      failure?: { message?: string };
      result?: Record<string, unknown> & {
        activity?: {
          status?: string;
          failure?: { message?: string };
          result?: Record<string, unknown>;
        };
      };
    };
  };

  const outer = root.activity;
  const nested = outer?.result?.activity;
  const resultBag = (nested?.result ?? outer?.result) as Record<string, unknown> | undefined;

  return {
    activityId: outer?.id,
    status: nested?.status ?? outer?.status,
    failure: nested?.failure?.message ?? outer?.failure?.message,
    resultBag,
  };
}

function parseActivityResult<T>(json: unknown, resultKey: string): T | undefined {
  const { resultBag } = getActivityEnvelope(json);
  if (!resultBag) return undefined;

  const direct = resultBag[resultKey];
  if (direct) return direct as T;

  const inner = resultBag.activity as { result?: Record<string, unknown> } | undefined;
  return inner?.result?.[resultKey] as T | undefined;
}

function assertTurnkeyActivityOk(json: unknown, action: string): void {
  const { status, failure } = getActivityEnvelope(json);
  if (failure) throw new Error(`Turnkey ${action} failed: ${failure}`);
  if (!status) return;

  if (status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED') {
    throw new Error(`Turnkey ${action} needs quorum approval (CONSENSUS_NEEDED)`);
  }
  if (status === 'ACTIVITY_STATUS_PENDING' || status === 'ACTIVITY_STATUS_CREATED') {
    throw new Error(`Turnkey ${action} still pending (${status})`);
  }
  if (status === 'ACTIVITY_STATUS_FAILED' || status === 'ACTIVITY_STATUS_REJECTED') {
    throw new Error(`Turnkey ${action} rejected (${status})`);
  }
}

/** Create any managed EVM wallet (settlement, gas). */
export async function createManagedWallet(
  index: number,
  label: string,
): Promise<CreatedDepositWallet> {
  if (isTurnkeyConfigured()) {
    return createTurnkeyWallet(label);
  }

  const mnemonic = devMnemonic();
  if (!mnemonic) {
    throw new Error(
      'Turnkey not configured. Set TURNKEY_* secrets or TREASURY_DEV_MNEMONIC for development.',
    );
  }

  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  return {
    turnkeyWalletId: `dev-hd-${index}`,
    turnkeyWalletAccountId: null,
    address: account.address,
    provider: 'dev_hd',
    hdIndex: index,
  };
}

/** Parent HD wallet for deposit address derivation (index 0). */
export async function createTurnkeyDepositsParentWallet(
  label: string,
): Promise<{ turnkeyWalletId: string; address: string }> {
  const orgId = Deno.env.get('TURNKEY_ORGANIZATION_ID')!;

  const body = {
    type: 'ACTIVITY_TYPE_CREATE_WALLET',
    organizationId: orgId,
    parameters: {
      walletName: label.slice(0, 64),
      accounts: [
        {
          ...evmAccountTemplate,
          path: depositDerivationPath(0),
        },
      ],
    },
    timestampMs: String(Date.now()),
  };

  const json = await stampAndPost('create_wallet', body);
  assertTurnkeyActivityOk(json, 'create_wallet');
  const result = parseActivityResult<{
    walletId?: string;
    addresses?: string[];
  }>(json, 'createWalletResult');

  const walletId = result?.walletId;
  const address = result?.addresses?.[0];
  if (!walletId || !address) {
    console.warn('[turnkey] create_wallet deposits parent:', JSON.stringify(json).slice(0, 500));
    throw new Error('Turnkey create_wallet returned no address');
  }

  return { turnkeyWalletId: walletId, address };
}

/** Derive deposit addresses under an existing HD wallet (Turnkey Payment Orchestration). */
export async function createTurnkeyWalletAccountsBatch(
  walletId: string,
  startIndex: number,
  count: number,
): Promise<DerivedDepositAccount[]> {
  const accounts = Array.from({ length: count }, (_, i) => {
    const derivationIndex = startIndex + i;
    return {
      ...evmAccountTemplate,
      path: depositDerivationPath(derivationIndex),
      name: `D3-Deposit-${String(derivationIndex).padStart(4, '0')}`,
    };
  });

  const body = {
    type: 'ACTIVITY_TYPE_CREATE_WALLET_ACCOUNTS',
    organizationId: Deno.env.get('TURNKEY_ORGANIZATION_ID')!,
    parameters: {
      walletId,
      accounts,
      persist: true,
    },
    timestampMs: String(Date.now()),
  };

  const json = await stampAndPost('create_wallet_accounts', body);
  assertTurnkeyActivityOk(json, 'create_wallet_accounts');
  const result = parseActivityResult<{ addresses?: string[] }>(json, 'createWalletAccountsResult');
  const addresses = result?.addresses ?? [];

  if (addresses.length !== count) {
    console.warn('[turnkey] create_wallet_accounts:', JSON.stringify(json).slice(0, 500));
    throw new Error(`Expected ${count} deposit addresses, got ${addresses.length}`);
  }

  return addresses.map((address, i) => {
    const derivationIndex = startIndex + i;
    return {
      address,
      derivationIndex,
      path: depositDerivationPath(derivationIndex),
      turnkeyWalletId: walletId,
      provider: 'turnkey' as const,
    };
  });
}

async function createTurnkeyWallet(label: string): Promise<CreatedDepositWallet> {
  const orgId = Deno.env.get('TURNKEY_ORGANIZATION_ID')!;

  const body = {
    type: 'ACTIVITY_TYPE_CREATE_WALLET',
    organizationId: orgId,
    parameters: {
      walletName: label.slice(0, 64),
      accounts: [
        {
          ...evmAccountTemplate,
          path: "m/44'/60'/0'/0/0",
        },
      ],
    },
    timestampMs: String(Date.now()),
  };

  const json = await stampAndPost('create_wallet', body);
  assertTurnkeyActivityOk(json, 'create_wallet');
  const result = parseActivityResult<{
    walletId?: string;
    addresses?: string[];
  }>(json, 'createWalletResult');

  const walletId = result?.walletId;
  const address = result?.addresses?.[0];
  if (!walletId || !address) {
    console.warn('[turnkey] create_wallet response:', JSON.stringify(json).slice(0, 1200));
    throw new Error('Turnkey create_wallet returned no address');
  }

  return {
    turnkeyWalletId: walletId,
    turnkeyWalletAccountId: null,
    address,
    provider: 'turnkey',
  };
}

export function getBscPublicClient() {
  const rpc = Deno.env.get('BSC_RPC_URL') ?? 'https://bsc-dataseed.binance.org';
  return createPublicClient({ chain: bsc, transport: http(rpc) });
}

function getDevAccount(hdIndex: number) {
  const mnemonic = devMnemonic();
  if (!mnemonic) throw new Error('TREASURY_DEV_MNEMONIC required for dev signing');
  return mnemonicToAccount(mnemonic, { addressIndex: hdIndex });
}

function signingContextFromRow(row: {
  address: string;
  metadata?: {
    provider?: string;
    hd_index?: number;
    derivation_index?: number;
  } | null;
}): WalletSigningContext {
  const provider = row.metadata?.provider === 'dev_hd' ? 'dev_hd' : 'turnkey';
  return {
    address: row.address,
    provider,
    hdIndex: row.metadata?.hd_index ?? row.metadata?.derivation_index,
  };
}

function normalizeHex(value: string): Hex {
  const trimmed = value.trim();
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
}

async function signWithTurnkey(address: string, unsignedTransaction: Hex): Promise<Hex> {
  const orgId = Deno.env.get('TURNKEY_ORGANIZATION_ID')!;
  const body = {
    type: 'ACTIVITY_TYPE_SIGN_TRANSACTION_V2',
    organizationId: orgId,
    parameters: {
      signWith: address,
      unsignedTransaction,
      type: 'TRANSACTION_TYPE_ETHEREUM',
    },
    timestampMs: String(Date.now()),
  };

  const json = await stampAndPost('sign_transaction', body);
  assertTurnkeyActivityOk(json, 'sign_transaction');
  const result = parseActivityResult<{ signedTransaction?: string }>(json, 'signTransactionResult');
  const signed = result?.signedTransaction;
  if (!signed) {
    console.warn('[turnkey] sign_transaction response:', JSON.stringify(json).slice(0, 500));
    throw new Error('Turnkey sign_transaction returned no signedTransaction');
  }
  return normalizeHex(signed);
}

async function buildAndSignTx(
  ctx: WalletSigningContext,
  request: Parameters<ReturnType<typeof getBscPublicClient>['prepareTransactionRequest']>[0],
): Promise<Hash> {
  const client = getBscPublicClient();
  const prepared = await client.prepareTransactionRequest({
    ...request,
    chain: bsc,
  });

  let signed: Hex;
  if (ctx.provider === 'dev_hd') {
    if (ctx.hdIndex === undefined) throw new Error('Missing hd_index for dev wallet');
    const account = getDevAccount(ctx.hdIndex);
    signed = await account.signTransaction(prepared);
  } else {
    const unsigned = serializeTransaction(prepared);
    signed = await signWithTurnkey(ctx.address, unsigned);
  }

  return client.sendRawTransaction({ serializedTransaction: normalizeHex(signed) });
}

export async function getNativeBalance(address: string): Promise<bigint> {
  const client = getBscPublicClient();
  return client.getBalance({ address: address as Address });
}

export async function getErc20Balance(tokenContract: string, address: string): Promise<bigint> {
  const client = getBscPublicClient();
  return client.readContract({
    address: tokenContract as Address,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [address as Address],
  });
}

export async function ensureGasBalance(
  ctx: WalletSigningContext,
  gasFundingCtx?: WalletSigningContext,
): Promise<void> {
  const balance = await getNativeBalance(ctx.address);
  if (balance >= MIN_GAS_BALANCE_WEI) return;

  if (!gasFundingCtx) {
    throw new Error(`Wallet ${ctx.address} needs BNB for gas and no gas wallet is configured`);
  }

  await sendNativeTransfer({
    from: gasFundingCtx,
    to: ctx.address,
    valueWei: GAS_TOP_UP_WEI,
  });
}

export async function sendNativeTransfer(opts: {
  from: WalletSigningContext;
  to: string;
  valueWei: bigint;
}): Promise<Hash> {
  return buildAndSignTx(opts.from, {
    account: opts.from.address as Address,
    to: opts.to as Address,
    value: opts.valueWei,
    data: '0x',
  });
}

export async function sendErc20Transfer(opts: {
  from: WalletSigningContext;
  tokenContract: string;
  to: string;
  amountWei: bigint;
  gasFundingCtx?: WalletSigningContext;
}): Promise<Hash> {
  await ensureGasBalance(opts.from, opts.gasFundingCtx);

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [opts.to as Address, opts.amountWei],
  });

  return buildAndSignTx(opts.from, {
    account: opts.from.address as Address,
    to: opts.tokenContract as Address,
    value: 0n,
    data,
  });
}

/** Send an arbitrary contract call (value 0 by default) from a managed wallet. */
export async function sendContractCall(opts: {
  from: WalletSigningContext;
  to: string;
  data: Hex;
  valueWei?: bigint;
  gasFundingCtx?: WalletSigningContext;
}): Promise<Hash> {
  await ensureGasBalance(opts.from, opts.gasFundingCtx);
  return buildAndSignTx(opts.from, {
    account: opts.from.address as Address,
    to: opts.to as Address,
    value: opts.valueWei ?? 0n,
    data: opts.data,
  });
}

export function walletContextFromDbRow(row: {
  address: string;
  metadata?: Record<string, unknown> | null;
}): WalletSigningContext {
  return signingContextFromRow({
    address: row.address,
    metadata: row.metadata as { provider?: string; hd_index?: number } | null,
  });
}

export type TreasuryTransferAsset = 'usdt' | 'bnb';

export type TreasuryTransferSubmission = {
  activityId?: string;
  status?: string;
  signedTransaction?: string;
  txHash?: string;
  /** True when the wallet is protected by a Turnkey consensus policy and the
   *  request now awaits the remaining signer approvals in the Turnkey panel. */
  awaitingConsensus: boolean;
};

/**
 * Propose an outbound transfer from a multisig-protected treasury wallet.
 *
 * Builds the BSC transaction (native BNB or USDT ERC-20), then submits a
 * Turnkey SIGN_TRANSACTION activity. Unlike buildAndSignTx this does NOT assert
 * completion: when the wallet is guarded by a 2/3 consensus policy Turnkey
 * returns ACTIVITY_STATUS_CONSENSUS_NEEDED, and we surface that as
 * `awaitingConsensus` so callers can persist the activityId and broadcast later
 * once the quorum approves. Dev-HD wallets (no consensus) sign+broadcast inline.
 */
export async function submitTreasuryTransfer(opts: {
  from: WalletSigningContext;
  asset: TreasuryTransferAsset;
  to: string;
  /** Human-readable amount, e.g. "125.5". */
  amount: string;
}): Promise<TreasuryTransferSubmission> {
  const client = getBscPublicClient();

  const request =
    opts.asset === 'bnb'
      ? {
          account: opts.from.address as Address,
          to: opts.to as Address,
          value: parseUnits(opts.amount, 18),
        }
      : {
          account: opts.from.address as Address,
          to: BSC_USDT_CONTRACT as Address,
          value: 0n,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [opts.to as Address, parseUnits(opts.amount, BSC_USDT_DECIMALS)],
          }),
        };

  const prepared = await client.prepareTransactionRequest({ ...request, chain: bsc });

  // Dev fallback: no multisig, sign + broadcast immediately.
  if (opts.from.provider === 'dev_hd') {
    // T-C hard guard (defense in depth): the consensus-less dev signer may only
    // move treasury funds when the operator has explicitly opted in. Production
    // treasury outflows must route through the real Turnkey root-quorum wallet.
    if (Deno.env.get('ALLOW_DEV_TREASURY') !== 'true') {
      throw new HttpError(503, 'Treasury dev signing disabled');
    }
    if (opts.from.hdIndex === undefined) throw new Error('Missing hd_index for dev wallet');
    const account = getDevAccount(opts.from.hdIndex);
    const signed = await account.signTransaction(prepared);
    const txHash = await client.sendRawTransaction({
      serializedTransaction: normalizeHex(signed),
    });
    return { status: 'ACTIVITY_STATUS_COMPLETED', txHash, awaitingConsensus: false };
  }

  const unsigned = serializeTransaction(prepared);
  const json = await stampAndPost('sign_transaction', {
    type: 'ACTIVITY_TYPE_SIGN_TRANSACTION_V2',
    organizationId: Deno.env.get('TURNKEY_ORGANIZATION_ID')!,
    parameters: {
      signWith: opts.from.address,
      unsignedTransaction: unsigned,
      type: 'TRANSACTION_TYPE_ETHEREUM',
    },
    timestampMs: String(Date.now()),
  });

  const env = getActivityEnvelope(json);
  if (env.failure) throw new Error(`Turnkey sign_transaction failed: ${env.failure}`);

  const result = parseActivityResult<{ signedTransaction?: string }>(
    json,
    'signTransactionResult',
  );
  const signedTransaction = result?.signedTransaction
    ? normalizeHex(result.signedTransaction)
    : undefined;

  // Single-signer wallet: activity completes instantly, broadcast now.
  if (env.status === 'ACTIVITY_STATUS_COMPLETED' && signedTransaction) {
    const txHash = await client.sendRawTransaction({ serializedTransaction: signedTransaction });
    return { activityId: env.activityId, status: env.status, signedTransaction, txHash, awaitingConsensus: false };
  }

  return {
    activityId: env.activityId,
    status: env.status,
    signedTransaction,
    awaitingConsensus: env.status === 'ACTIVITY_STATUS_CONSENSUS_NEEDED',
  };
}

/**
 * Poll a pending Turnkey SIGN_TRANSACTION activity (used to check whether the
 * quorum has approved a treasury transfer). Returns the current status and, once
 * approved, the signed transaction ready to broadcast.
 */
export async function pollTurnkeyActivity(activityId: string): Promise<{
  status?: string;
  signedTransaction?: string;
  failure?: string;
}> {
  const json = await stampAndQuery('get_activity', {
    organizationId: Deno.env.get('TURNKEY_ORGANIZATION_ID')!,
    activityId,
  });
  const env = getActivityEnvelope(json);
  const result = parseActivityResult<{ signedTransaction?: string }>(
    json,
    'signTransactionResult',
  );
  return {
    status: env.status,
    signedTransaction: result?.signedTransaction
      ? normalizeHex(result.signedTransaction)
      : undefined,
    failure: env.failure,
  };
}

/** Broadcast an already-signed (quorum-approved) serialized transaction. */
export async function broadcastSignedTransaction(signedTransaction: string): Promise<string> {
  const client = getBscPublicClient();
  return client.sendRawTransaction({
    serializedTransaction: normalizeHex(signedTransaction),
  });
}

export async function verifyUsdtTransfer(opts: {
  txHash: Hash;
  expectedTo: string;
  minAmountWei: bigint;
}): Promise<{ ok: boolean; amount: bigint; confirmations: number }> {
  const client = getBscPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: opts.txHash });
  if (!receipt || receipt.status !== 'success') {
    return { ok: false, amount: 0n, confirmations: 0 };
  }

  const block = await client.getBlockNumber();
  const confirmations = Number(block - receipt.blockNumber + 1n);

  let transferred = 0n;
  const expectedTo = opts.expectedTo.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BSC_USDT_CONTRACT.toLowerCase()) continue;

    let amount = 0n;
    let toAddr = '';

    try {
      const decoded = client.decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'Transfer') {
        toAddr = (decoded.args.to as string).toLowerCase();
        amount = decoded.args.value as bigint;
      }
    } catch {
      // Fallback: parse indexed Transfer log manually (Edge viem decode can fail).
    }

    if (amount === 0n && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics.length >= 3) {
      toAddr = (`0x${log.topics[2]!.slice(-40)}`).toLowerCase();
      amount = BigInt(log.data);
    }

    if (toAddr === expectedTo) {
      transferred += amount;
    }
  }

  const ok = transferred >= opts.minAmountWei && confirmations >= BSC_MIN_CONFIRMATIONS;
  return { ok, amount: transferred, confirmations };
}

/** Scan recent blocks for USDT transfers to a deposit address (monitor fallback). */
export async function findUsdtTransferToAddress(opts: {
  depositAddress: string;
  minAmountWei: bigint;
  lookbackBlocks?: number;
}): Promise<{ txHash: Hash; amount: bigint; confirmations: number } | null> {
  const client = getBscPublicClient();
  const latest = await client.getBlockNumber();
  const lookback = BigInt(opts.lookbackBlocks ?? 5000);
  const fromBlock = latest > lookback ? latest - lookback : 0n;

  const logs = await client.getLogs({
    address: BSC_USDT_CONTRACT as Address,
    event: transferEvent,
    args: { to: opts.depositAddress as Address },
    fromBlock,
    toBlock: latest,
  });

  if (logs.length === 0) return null;

  const log = logs[logs.length - 1]!;
  const amount = log.args.value as bigint;
  if (amount < opts.minAmountWei) return null;

  const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
  if (!receipt || receipt.status !== 'success') return null;

  const confirmations = Number(latest - receipt.blockNumber + 1n);
  if (confirmations < BSC_MIN_CONFIRMATIONS) return null;

  return { txHash: log.transactionHash, amount, confirmations };
}

export function parseUsdtAmount(amount: number): bigint {
  const scaled = Math.round(amount * 10 ** BSC_USDT_DECIMALS);
  return BigInt(scaled);
}

export function formatUsdtAmount(wei: bigint): string {
  const base = 10n ** BigInt(BSC_USDT_DECIMALS);
  const whole = wei / base;
  const frac = wei % base;
  return `${whole}.${frac.toString().padStart(BSC_USDT_DECIMALS, '0').replace(/0+$/, '') || '0'}`;
}

export function treasuryAddressFromEnv(): string | null {
  return Deno.env.get('TURNKEY_TREASURY_ADDRESS')?.trim() ?? null;
}

export function treasuryWalletIdFromEnv(): string | null {
  return Deno.env.get('TURNKEY_TREASURY_WALLET_ID')?.trim() ?? null;
}

export function settlementWalletsFromEnv(): Array<{ address: string; walletId?: string }> {
  const addresses =
    Deno.env.get('TURNKEY_SETTLEMENT_ADDRESSES')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const walletIds =
    Deno.env.get('TURNKEY_SETTLEMENT_WALLET_IDS')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return addresses.map((address, i) => ({ address, walletId: walletIds[i] }));
}

export function gasWalletFromEnv(): { address: string; walletId?: string } | null {
  const address = Deno.env.get('TURNKEY_GAS_WALLET_ADDRESS')?.trim();
  if (!address) return null;
  return { address, walletId: Deno.env.get('TURNKEY_GAS_WALLET_ID')?.trim() };
}

export function isTurnkeyConsensusError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('CONSENSUS_NEEDED') || msg.includes('quorum approval');
}

export function settlementWalletCount(): number {
  const raw = Deno.env.get('SETTLEMENT_WALLET_COUNT');
  const n = raw ? Number(raw) : 3;
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10) : 3;
}

export function settlementToTreasuryMinUsdt(): number {
  const raw = Deno.env.get('SETTLEMENT_TO_TREASURY_MIN_USDT');
  const n = raw ? Number(raw) : 100;
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/** Basis points (0–10000) of settlement balance routed to the flash-swap wallet. Default 10%. */
export function settlementFlashSwapSplitBps(): number {
  const pct = Deno.env.get('SETTLEMENT_TO_FLASH_SWAP_PCT');
  if (pct) {
    const n = Number(pct);
    if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.round(n * 100);
  }
  const bps = Deno.env.get('SETTLEMENT_TO_FLASH_SWAP_BPS');
  const n = bps ? Number(bps) : 1000;
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.floor(n) : 1000;
}

export function flashSwapWalletFromEnv(): { address: string; walletId?: string } | null {
  const address = Deno.env.get('TURNKEY_FLASH_SWAP_WALLET_ADDRESS')?.trim();
  if (!address) return null;
  return { address, walletId: Deno.env.get('TURNKEY_FLASH_SWAP_WALLET_ID')?.trim() };
}

export { BSC_CHAIN_ID, MIN_GAS_BALANCE_WEI, GAS_TOP_UP_WEI };
