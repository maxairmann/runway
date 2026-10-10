import type { Units } from './engine/types';

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  const s = Number.isInteger(r) ? Math.round(r).toString() : r.toFixed(1);
  return s.replace('-', '−');
}

export function hours(h: number): string {
  return `${num(Math.abs(h) < 0.05 ? 0 : h)} h`;
}

export function days(h: number, perDay: number): string {
  const d = h / (perDay || 8);
  const r = Math.abs(d) < 0.05 ? 0 : d;
  return `${num(r)} ${Math.abs(Math.round(r * 10) / 10) === 1 ? 'day' : 'days'}`;
}

export function hoursAndDays(h: number, perDay: number): string {
  return `${hours(h)} (${days(h, perDay)})`;
}

/** The household's chosen unit (days by default). */
export function amount(h: number, perDay: number, units: Units = 'days'): string {
  return units === 'days' ? days(h, perDay) : hours(h);
}

/** The other unit, for a quiet second line. */
export function otherAmount(h: number, perDay: number, units: Units = 'days'): string {
  return units === 'days' ? hours(h) : days(h, perDay);
}

/** "2-day" or "16-hour", for "the 2-day cushion". */
export function sizeAdjective(h: number, perDay: number, units: Units = 'days'): string {
  return units === 'days' ? `${num(h / (perDay || 8))}-day` : `${num(h)}-hour`;
}

/** Convert hours to the display unit, as a number (for chart axes). */
export function toUnits(h: number, perDay: number, units: Units = 'days'): number {
  return units === 'days' ? h / (perDay || 8) : h;
}

/** "Sam", "Sam and Jordan", "Sam, Jordan, and Lee" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
