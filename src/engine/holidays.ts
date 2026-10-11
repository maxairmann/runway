import { daysInMonth, fromDay, isoOf, toDay, weekdayOf, type ISODate } from './dates';
import type { Holiday, HolidaySet, Member } from './types';
import { jewishHolidays } from './hebrew';

/** nth (1-based) weekday of a month; n = -1 means the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): ISODate {
  if (n > 0) {
    const first = toDay(isoOf(y, m, 1));
    const offset = (weekday - weekdayOf(first) + 7) % 7;
    return fromDay(first + offset + (n - 1) * 7);
  }
  const last = toDay(isoOf(y, m, daysInMonth(y, m)));
  const back = (weekdayOf(last) - weekday + 7) % 7;
  return fromDay(last - back);
}

/** Fixed-date holidays move to Friday when on Saturday and Monday when on Sunday. */
function observed(iso: ISODate): ISODate {
  const n = toDay(iso);
  const wd = weekdayOf(n);
  if (wd === 6) return fromDay(n - 1);
  if (wd === 0) return fromDay(n + 1);
  return iso;
}

function federal(y: number): Holiday[] {
  return [
    { date: observed(isoOf(y, 1, 1)), name: "New Year's Day" },
    { date: nthWeekday(y, 1, 1, 3), name: 'Martin Luther King Jr. Day' },
    { date: nthWeekday(y, 2, 1, 3), name: "Presidents' Day" },
    { date: nthWeekday(y, 5, 1, -1), name: 'Memorial Day' },
    { date: observed(isoOf(y, 6, 19)), name: 'Juneteenth' },
    { date: observed(isoOf(y, 7, 4)), name: 'Independence Day' },
    { date: nthWeekday(y, 9, 1, 1), name: 'Labor Day' },
    { date: nthWeekday(y, 10, 1, 2), name: 'Columbus Day' },
    { date: observed(isoOf(y, 11, 11)), name: 'Veterans Day' },
    { date: nthWeekday(y, 11, 4, 4), name: 'Thanksgiving' },
    { date: observed(isoOf(y, 12, 25)), name: 'Christmas Day' },
  ];
}

/** The holidays most US private employers give. */
function common(y: number): Holiday[] {
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return [
    { date: observed(isoOf(y, 1, 1)), name: "New Year's Day" },
    { date: nthWeekday(y, 5, 1, -1), name: 'Memorial Day' },
    { date: observed(isoOf(y, 7, 4)), name: 'Independence Day' },
    { date: nthWeekday(y, 9, 1, 1), name: 'Labor Day' },
    { date: thanksgiving, name: 'Thanksgiving' },
    { date: fromDay(toDay(thanksgiving) + 1), name: 'Day after Thanksgiving' },
    { date: observed(isoOf(y, 12, 25)), name: 'Christmas Day' },
  ];
}

export const HOLIDAY_SET_LABELS: Record<HolidaySet, string> = {
  none: 'None',
  common: 'Common company holidays (7)',
  federal: 'US federal holidays (11)',
};

/** Holidays shown on the calendar but not given off by the employer. */
export function markedHolidays(member: Member, fromYear: number, toYear: number): Holiday[] {
  return member.jewishHolidays ? jewishHolidays(fromYear, toYear, { minor: true }) : [];
}

export function presetHolidays(set: HolidaySet, fromYear: number, toYear: number): Holiday[] {
  if (set === 'none') return [];
  const out: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...(set === 'federal' ? federal(y) : common(y)));
  return out;
}

/** Every holiday that applies to this member between two years, presets plus custom. */
export function memberHolidays(member: Member, fromYear: number, toYear: number): Holiday[] {
  const all = [...presetHolidays(member.holidaySet, fromYear, toYear), ...member.holidays];
  return all.sort((a, b) => (a.date < b.date ? -1 : 1));
}
