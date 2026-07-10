import { shortWallet } from '@/lib/wallet';

export type PartnerPaymentErrorPayload =
  | { code: 'invalid_amount' }
  | { code: 'wallet_required' }
  | { code: 'no_wallet' }
  | { code: 'usdt_insufficient'; required: string; balance: string; wallet: string }
  | { code: 'gas_insufficient'; required: string; balance: string; wallet: string }
  | { code: 'user_rejected' }
  | { code: 'wrong_chain' }
  | { code: 'timeout' }
  | { code: 'generic'; message?: string };

export class PartnerPaymentError extends Error {
  readonly payload: PartnerPaymentErrorPayload;

  constructor(payload: PartnerPaymentErrorPayload) {
    super(payload.code);
    this.name = 'PartnerPaymentError';
    this.payload = payload;
  }
}

export function toPartnerPaymentError(e: unknown): PartnerPaymentErrorPayload {
  if (e instanceof PartnerPaymentError) return e.payload;

  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (msg.includes('无效支付金额')) return { code: 'invalid_amount' };
  if (msg.includes('请连接钱包')) return { code: 'wallet_required' };
  if (msg.includes('未找到可用钱包')) return { code: 'no_wallet' };
  if (msg.includes('充值确认超时')) return { code: 'timeout' };

  if (
    lower.includes('transfer amount exceeds') ||
    lower.includes('exceeds balance') ||
    lower.includes('usdt 余额不足')
  ) {
    const detail = parseBalanceDetail(msg);
    if (detail) {
      return {
        code: 'usdt_insufficient',
        required: detail.required,
        balance: detail.balance,
        wallet: detail.wallet,
      };
    }
    return {
      code: 'usdt_insufficient',
      required: '—',
      balance: '—',
      wallet: extractWallet(msg) ?? '—',
    };
  }

  if (
    lower.includes('insufficient funds') ||
    lower.includes('gas required exceeds') ||
    lower.includes('bnb gas') ||
    (lower.includes('gas') && lower.includes('low'))
  ) {
    const detail = parseGasDetail(msg);
    if (detail) {
      return {
        code: 'gas_insufficient',
        required: detail.required,
        balance: detail.balance,
        wallet: detail.wallet,
      };
    }
    return {
      code: 'gas_insufficient',
      required: '—',
      balance: '—',
      wallet: extractWallet(msg) ?? '—',
    };
  }

  if (lower.includes('user rejected') || lower.includes('denied') || lower.includes('取消交易')) {
    return { code: 'user_rejected' };
  }
  if (lower.includes('chain') && lower.includes('mismatch')) {
    return { code: 'wrong_chain' };
  }

  return { code: 'generic', message: msg };
}

function extractWallet(msg: string): string | null {
  const match = msg.match(/0x[a-fA-F0-9]{40}/);
  return match ? shortWallet(match[0]) : null;
}

function parseBalanceDetail(msg: string): { required: string; balance: string; wallet: string } | null {
  const required = msg.match(/需要\s*([\d.]+)\s*USDT/i)?.[1];
  const balance = msg.match(/当前\s*([\d.]+)\s*USDT/i)?.[1];
  const wallet = extractWallet(msg);
  if (required && balance && wallet) return { required, balance, wallet };
  return null;
}

function parseGasDetail(msg: string): { required: string; balance: string; wallet: string } | null {
  const required = msg.match(/需要约?\s*([\d.]+)\s*BNB/i)?.[1];
  const balance = msg.match(/当前\s*([\d.]+)\s*BNB/i)?.[1];
  const wallet = extractWallet(msg);
  if (required && balance && wallet) return { required, balance, wallet };
  return null;
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export function formatPartnerPaymentError(p: TranslateFn, payload: PartnerPaymentErrorPayload): string {
  switch (payload.code) {
    case 'invalid_amount':
      return p('stake.payError.invalidAmount');
    case 'wallet_required':
      return p('stake.payError.walletRequired');
    case 'no_wallet':
      return p('stake.payError.noWallet');
    case 'usdt_insufficient':
      return p('stake.payError.usdtInsufficient', {
        required: payload.required,
        balance: payload.balance,
        wallet: payload.wallet,
      });
    case 'gas_insufficient':
      return p('stake.payError.gasInsufficient', {
        required: payload.required,
        balance: payload.balance,
        wallet: payload.wallet,
      });
    case 'user_rejected':
      return p('stake.payError.userRejected');
    case 'wrong_chain':
      return p('stake.payError.wrongChain');
    case 'timeout':
      return p('stake.payError.timeout');
    case 'generic':
      return payload.message?.trim() ? payload.message : p('stake.payError.generic');
    default:
      return p('stake.payError.generic');
  }
}

export function partnerPaymentErrorTitle(p: TranslateFn): string {
  return p('stake.payError.title');
}
