import { describe, expect, it } from 'vitest';
import { jewishHolidays } from './hebrew';

const find = (name: string, year: number) =>
  jewishHolidays(year, year, { minor: true })
    .filter((h) => h.name === name)
    .map((h) => h.date);

describe('Jewish holidays (first full day; they begin the evening before)', () => {
  it('matches published dates for 2025', () => {
    expect(find('Rosh Hashanah', 2025)).toEqual(['2025-09-23']);
    expect(find('Yom Kippur', 2025)).toEqual(['2025-10-02']);
    expect(find('Passover', 2025)).toEqual(['2025-04-13']);
    expect(find('Hanukkah', 2025)).toEqual(['2025-12-15']);
  });

  it('matches published dates for 2026', () => {
    expect(find('Purim', 2026)).toEqual(['2026-03-03']);
    expect(find('Passover', 2026)).toEqual(['2026-04-02']);
    expect(find('Shavuot', 2026)).toEqual(['2026-05-22']);
    expect(find('Rosh Hashanah', 2026)).toEqual(['2026-09-12']);
    expect(find('Yom Kippur', 2026)).toEqual(['2026-09-21']);
    expect(find('Sukkot', 2026)).toEqual(['2026-09-26']);
    expect(find('Hanukkah', 2026)).toEqual(['2026-12-05']);
  });

  it('matches published dates for 2027', () => {
    expect(find('Passover', 2027)).toEqual(['2027-04-22']);
    expect(find('Rosh Hashanah', 2027)).toEqual(['2027-10-02']);
    expect(find('Yom Kippur', 2027)).toEqual(['2027-10-11']);
  });

  it('leaves out Hanukkah and Purim unless asked', () => {
    const names = new Set(jewishHolidays(2026, 2026).map((h) => h.name));
    expect(names.has('Hanukkah')).toBe(false);
    expect(names.has('Purim')).toBe(false);
    expect(names.has('Yom Kippur')).toBe(true);
  });
});
