const PREFIX = 'd3-partner-team-alias:';

export function teamAliasStorageKey(wallet: string): string {
  return `${PREFIX}${wallet.trim().toLowerCase()}`;
}

export function loadTeamAliases(wallet: string | null): Record<string, string> {
  if (!wallet || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(teamAliasStorageKey(wallet));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [addr, name] of Object.entries(parsed)) {
      const trimmed = String(name ?? '').trim();
      if (trimmed) out[addr.toLowerCase()] = trimmed;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveTeamAliases(wallet: string, aliases: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(teamAliasStorageKey(wallet), JSON.stringify(aliases));
}

export function setTeamAlias(
  wallet: string,
  aliases: Record<string, string>,
  address: string,
  alias: string,
): Record<string, string> {
  const key = address.trim().toLowerCase();
  const next = { ...aliases };
  const trimmed = alias.trim();
  if (!trimmed) delete next[key];
  else next[key] = trimmed;
  saveTeamAliases(wallet, next);
  return next;
}

export function getTeamAlias(aliases: Record<string, string>, address: string): string {
  return aliases[address.trim().toLowerCase()] ?? '';
}

export function resolveTeamNodeDisplayName(
  aliases: Record<string, string>,
  address: string,
  fallback?: string,
): string {
  return getTeamAlias(aliases, address) || fallback || '';
}
