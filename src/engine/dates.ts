// Calendar math on whole UTC days, so time zones and DST never shift a date.
// A "day number" is days since 1970-01-01.

export type ISODate = string; // YYYY-MM-DD

const MS_PER_DAY = 86_400_000;

export function toDay(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDay(n: number): ISODate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromDay(toDay(iso) + n);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(n: number): number {
  return new Date(n * MS_PER_DAY).getUTCDay();
}

export function partsOf(n: number): { y: number; m: number; d: number } {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isoOf(y: number, m: number, d: number): ISODate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today in the viewer's local time zone. */
export function todayISO(): ISODate {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatDate(iso: ISODate, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'short', day: 'numeric' }
      : style === 'medium'
        ? { month: 'short', day: 'numeric', year: 'numeric' }
        : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(
    new Date(toDay(iso) * MS_PER_DAY),
  );
}

export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start, 'medium');
  const a = partsOf(toDay(start));
  const b = partsOf(toDay(end));
  if (a.y === b.y) return `${formatDate(start, 'short')} – ${formatDate(end, 'medium')}`;
  return `${formatDate(start, 'medium')} – ${formatDate(end, 'medium')}`;
}
