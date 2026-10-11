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

/** US holidays to label: the federal list plus the day after Thanksgiving, which many employers give. */
function usHolidays(y: number): Holiday[] {
  const list = federal(y);
  const tg = list.find((h) => h.name === 'Thanksgiving')!;
  list.splice(list.indexOf(tg) + 1, 0, { date: fromDay(toDay(tg.date) + 1), name: 'Day after Thanksgiving' });
  return list;
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

export function presetHolidays(set: HolidaySet, fromYear: number, toYear: number): Holiday[] {
  if (set === 'none') return [];
  const out: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...(set === 'federal' ? federal(y) : common(y)));
  return out;
}

export type HolidayGroup = 'us' | 'jewish';

export interface LabeledHoliday extends Holiday {
  /** The name without "(day 2)" etc., used for the paid setting. */
  base: string;
  group: HolidayGroup;
}

export function baseName(name: string): string {
  return name.replace(/ \(day \d\)$/, '');
}

/** Every holiday name a person could mark as paid, in calendar order. */
export const US_HOLIDAY_NAMES = usHolidays(2026).map((h) => h.name);
export const JEWISH_HOLIDAY_NAMES = [
  'Rosh Hashanah',
  'Yom Kippur',
  'Sukkot',
  'Shemini Atzeret',
  'Simchat Torah',
  'Hanukkah',
  'Purim',
  'Passover',
  'Shavuot',
];

/** Holiday names this person gets as paid days off. Older plans fall back to their preset. */
export function paidNames(member: Member): Set<string> {
  if (member.paidHolidays) return new Set(member.paidHolidays);
  if (member.holidaySet === 'none') return new Set();
  const y = 2026;
  return new Set((member.holidaySet === 'federal' ? federal(y) : common(y)).map((h) => h.name));
}

/** Every holiday labeled on this person's calendar, paid or not. */
export function labeledHolidays(member: Member, fromYear: number, toYear: number): LabeledHoliday[] {
  const out: LabeledHoliday[] = [];
  const paid = paidNames(member);
  const showUs = member.usHolidays ?? true;
  for (let y = fromYear; y <= toYear; y++) {
    for (const h of usHolidays(y)) if (showUs || paid.has(h.name)) out.push({ ...h, base: h.name, group: 'us' });
  }
  for (const h of jewishHolidays(fromYear, toYear, { minor: true })) {
    const base = baseName(h.name);
    if (member.jewishHolidays || paid.has(base)) out.push({ ...h, base, group: 'jewish' });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Days off the employer gives (no PTO used): holidays marked paid, plus your own extra days. */
export function memberHolidays(member: Member, fromYear: number, toYear: number): Holiday[] {
  const paid = paidNames(member);
  const all: Holiday[] = [...labeledHolidays(member, fromYear, toYear).filter((h) => paid.has(h.base)), ...member.holidays];
  return all.sort((a, b) => (a.date < b.date ? -1 : 1));
}
