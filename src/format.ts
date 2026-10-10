export function hours(h: number): string {
  const v = Math.abs(h) < 0.05 ? 0 : h;
  const s = Number.isInteger(Math.round(v * 10) / 10) ? Math.round(v).toString() : v.toFixed(1);
  return `${s.replace('-', '−')} h`;
}

export function days(h: number, perDay: number): string {
  const d = h / (perDay || 8);
  const r = Math.round(d * 10) / 10;
  const s = Number.isInteger(r) ? r.toString() : r.toFixed(1);
  return `${s} ${Math.abs(r) === 1 ? 'day' : 'days'}`;
}

export function hoursAndDays(h: number, perDay: number): string {
  return `${hours(h)} (${days(h, perDay)})`;
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
