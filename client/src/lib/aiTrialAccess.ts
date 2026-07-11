export const AI_TRIAL_DAYS = 15;

const KEY_PREFIX = 'd3_ai_trial_start_';

function storageKey(wallet: string): string {
  return `${KEY_PREFIX}${wallet.trim().toLowerCase()}`;
}

export function getTrialStart(wallet: string | null | undefined): string | null {
  if (!wallet || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(storageKey(wallet));
}

export function startAiTrial(wallet: string): void {
  if (typeof localStorage === 'undefined') return;
  if (getTrialStart(wallet)) return;
  localStorage.setItem(storageKey(wallet), new Date().toISOString());
}

export function hasAiTrialStarted(wallet: string | null | undefined): boolean {
  return Boolean(getTrialStart(wallet));
}

/** Full days remaining including today when trial is active. */
export function getAiTrialDaysRemaining(wallet: string | null | undefined): number {
  const start = getTrialStart(wallet);
  if (!start) return AI_TRIAL_DAYS;
  const endMs = new Date(start).getTime() + AI_TRIAL_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
}

export function isAiTrialExpired(wallet: string | null | undefined): boolean {
  if (!hasAiTrialStarted(wallet)) return false;
  return getAiTrialDaysRemaining(wallet) <= 0;
}
