// Day-number helpers (days since 1970-01-01 UTC), as in the reference.
export const DAY = 864e5;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const toDay = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const v = Math.round(Date.UTC(y, m - 1, d) / DAY);
  return Number.isFinite(v) ? v : null;
};
export const toIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const fmt = (n: number) => { const d = new Date(n * DAY); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
export const fmtW = (n: number) => WD[new Date(n * DAY).getUTCDay()] + ' ' + fmt(n);
export const okDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDay(v) != null;
