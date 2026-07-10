const SGT = 'Asia/Singapore';

export function toSgtDateString(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: SGT });
}

export function addSgtDays(dateStr: string, delta: number): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, day + delta);
  return new Date(utc).toISOString().slice(0, 10);
}

export function sgtDayBounds(dateStr: string): { startIso: string; endIso: string } {
  const startIso = `${dateStr}T00:00:00+08:00`;
  const endIso = `${dateStr}T23:59:59.999+08:00`;
  return { startIso, endIso };
}

export function yesterdaySgtDateString(now = new Date()): string {
  return addSgtDays(toSgtDateString(now), -1);
}

export function startOfSgtDayIso(now = new Date()): string {
  return sgtDayBounds(toSgtDateString(now)).startIso;
}
