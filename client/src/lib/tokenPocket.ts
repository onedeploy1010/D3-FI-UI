/** Detect TokenPocket in-app browser or extension. */
export function isTokenPocketBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as Window & { ethereum?: { isTokenPocket?: boolean } }).ethereum;
  if (eth?.isTokenPocket) return true;
  return Boolean((window as Window & { tokenpocket?: unknown }).tokenpocket);
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/** Open current site inside TokenPocket DApp browser (mobile system browser only). */
export function openInTokenPocketApp(url = window.location.href): void {
  const params = encodeURIComponent(
    JSON.stringify({
      url,
      chain: 'BSC',
      source: 'd3fi',
    }),
  );
  window.location.href = `tpdapp://open?params=${params}`;
}
