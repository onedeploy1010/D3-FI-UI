type Lang = 'zh' | 'en';

export function formatCompactUsd(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatSignedCompactUsd(value: number): string {
  const n = Number(value) || 0;
  const prefix = n >= 0 ? '+' : '-';
  return `${prefix}${formatCompactUsd(Math.abs(n))}`;
}

export function formatCompactD3(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K D3`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} D3`;
}

export function formatCountdown(iso: string | null | undefined, lang: Lang = 'zh'): string {
  if (!iso) return lang === 'zh' ? '—' : '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return lang === 'zh' ? '已结算' : 'Settled';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

export function formatDeadline(iso: string | null | undefined, lang: Lang = 'zh'): string {
  if (!iso) return lang === 'zh' ? '—' : '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return lang === 'zh' ? '已结束' : 'Ended';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

export function formatUsdAmount(value: number): string {
  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPerVote(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function formatVoteCount(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function phaseLabel(phase: string, lang: Lang): string {
  const map: Record<string, [string, string]> = {
    lock: ['锁仓期', 'Lock'],
    voting: ['投票期', 'Voting'],
    bribe: ['贿赂期', 'Bribe'],
    settle: ['结算期', 'Settle'],
    claim: ['领取期', 'Claim'],
  };
  const row = map[phase] ?? ['—', '—'];
  return lang === 'zh' ? row[0] : row[1];
}
