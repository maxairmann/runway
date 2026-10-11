// Jewish holiday dates, computed from the Hebrew calendar (Reingold & Dershowitz,
// "Calendrical Calculations"). Dates are the first full day of each holiday;
// holidays begin at sundown the evening before.

import { fromDay } from './dates';
import type { Holiday } from './types';

/** Fixed day (R.D.) of 1 Tishrei, Hebrew year 1. */
const HEBREW_EPOCH = -1373427;
/** R.D. of 1970-01-01, to convert to the app's day numbers. */
const RD_UNIX_EPOCH = 719163;

function elapsedDays(year: number): number {
  const monthsElapsed = Math.floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const day = 29 * monthsElapsed + Math.floor(partsElapsed / 25920);
  return ((3 * (day + 1)) % 7 + 7) % 7 < 3 ? day + 1 : day;
}

function newYearDelay(year: number): number {
  const ny0 = elapsedDays(year - 1);
  const ny1 = elapsedDays(year);
  const ny2 = elapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

/** Day number (days since 1970-01-01) of Rosh Hashanah (1 Tishrei) of a Hebrew year. */
export function roshHashanah(hebrewYear: number): number {
  return HEBREW_EPOCH + elapsedDays(hebrewYear) + newYearDelay(hebrewYear) - RD_UNIX_EPOCH;
}

export interface JewishHolidayOptions {
  /** Include Hanukkah (first day) and Purim. */
  minor?: boolean;
}

/** Jewish holidays (diaspora observance) whose dates fall in the given Gregorian years. */
export function jewishHolidays(fromYear: number, toYear: number, opts: JewishHolidayOptions = {}): Holiday[] {
  const out: Holiday[] = [];
  const add = (n: number, name: string) => out.push({ date: fromDay(n), name });
  for (let g = fromYear - 1; g <= toYear + 1; g++) {
    // Fall holidays of Hebrew year g + 3761 (Tishrei falls in September/October of g).
    const hy = g + 3761;
    const rh = roshHashanah(hy);
    const nextRh = roshHashanah(hy + 1);
    add(rh, 'Rosh Hashanah');
    add(rh + 1, 'Rosh Hashanah (day 2)');
    add(rh + 9, 'Yom Kippur');
    add(rh + 14, 'Sukkot');
    add(rh + 15, 'Sukkot (day 2)');
    add(rh + 21, 'Shemini Atzeret');
    add(rh + 22, 'Simchat Torah');
    if (opts.minor) {
      // 25 Kislev: Tishrei has 30 days; Cheshvan has 30 in a complete year (355 or 385 days), else 29.
      const yearLength = nextRh - rh;
      const cheshvan = yearLength % 10 === 5 ? 30 : 29;
      add(rh + 30 + cheshvan + 24, 'Hanukkah');
    }
    // Spring holidays later in the same Hebrew year (Nisan falls in March/April of g + 1):
    // 15 Nisan is always 163 days before the next Rosh Hashanah.
    const pesach = nextRh - 163;
    add(pesach, 'Passover');
    add(pesach + 1, 'Passover (day 2)');
    add(pesach + 6, 'Passover (day 7)');
    add(pesach + 7, 'Passover (day 8)');
    add(pesach + 50, 'Shavuot');
    add(pesach + 51, 'Shavuot (day 2)');
    if (opts.minor) add(pesach - 30, 'Purim');
  }
  const lo = `${fromYear}-01-01`;
  const hi = `${toYear}-12-31`;
  return out.filter((h) => h.date >= lo && h.date <= hi).sort((a, b) => (a.date < b.date ? -1 : 1));
}
