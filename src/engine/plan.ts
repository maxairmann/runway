// Planning mode: days picked on the calendar, grouped into trips.

import { daysInMonth, fromDay, partsOf, toDay, weekdayOf, type ISODate } from './dates';
import { memberHolidays } from './holidays';
import { tripKind, type DayKind, type Member, type Trip, type TripStatus } from './types';

/** Days off, as a share of a full day: 1 = full day, 0.5 = half day, anything else = custom hours. */
export type Picks = Record<ISODate, number>;

export interface PickGroup {
  start: ISODate;
  end: ISODate;
  /** The picked days, in order. */
  days: ISODate[];
  halfDays: ISODate[];
  /** Custom shares of a day (neither 1 nor 0.5). */
  custom: Record<ISODate, number>;
}

/** Holidays as day numbers, per member, covering a span of years. */
export function holidaySets(members: Member[], fromYear: number, toYear: number): Map<string, Set<number>> {
  return new Map(members.map((m) => [m.id, new Set(memberHolidays(m, fromYear, toYear).map((h) => toDay(h.date)))]));
}

export function isWorkday(member: Member, n: number, holidays: Set<number> | undefined): boolean {
  return member.policy.workDays.includes(weekdayOf(n)) && !holidays?.has(n);
}

/**
 * Back-to-back picks become one group. Picks separated only by days nobody
 * going would work (weekends, holidays) are back-to-back: Friday + Monday is one trip.
 */
export function groupPicks(picks: Picks, members: Member[]): PickGroup[] {
  const days = Object.keys(picks).sort();
  if (days.length === 0) return [];
  const years = days.map((d) => partsOf(toDay(d)).y);
  const hol = holidaySets(members, Math.min(...years), Math.max(...years));
  const someoneWorks = (n: number) => members.some((m) => isWorkday(m, n, hol.get(m.id)));

  const groups: PickGroup[] = [];
  let cur: PickGroup | null = null;
  for (const d of days) {
    const n = toDay(d);
    let joins = false;
    if (cur) {
      joins = true;
      for (let g = toDay(cur.end) + 1; g < n; g++) {
        if (someoneWorks(g)) {
          joins = false;
          break;
        }
      }
    }
    if (cur && joins) {
      cur.end = d;
      cur.days.push(d);
    } else {
      cur = { start: d, end: d, days: [d], halfDays: [], custom: {} };
      groups.push(cur);
    }
    if (picks[d] === 0.5) cur.halfDays.push(d);
    else if (picks[d] !== 1) cur.custom[d] = picks[d];
  }
  return groups;
}

export function groupToTrip(g: PickGroup, memberIds: string[], id: string, title: string, status: TripStatus, hoursPerDay = 8): Trip {
  const custom = Object.entries(g.custom);
  return {
    id,
    title,
    start: g.start,
    end: g.end,
    memberIds,
    hoursPerDay: null,
    dayFraction: 1,
    halfDays: g.halfDays.length > 0 ? g.halfDays : undefined,
    dayHours: custom.length > 0 ? Object.fromEntries(custom.map(([d, f]) => [d, Math.round(f * hoursPerDay * 100) / 100])) : undefined,
    status,
  };
}

/** Trips for picks, for previewing them in the forecast before they're saved. */
export function picksAsTrips(picks: Picks, members: Member[], memberIds: string[]): Trip[] {
  const going = members.filter((m) => memberIds.includes(m.id));
  return groupPicks(picks, going).map((g, i) =>
    groupToTrip(g, memberIds, `__pick_${i}__`, 'Picked days', 'tentative', going[0]?.policy.hoursPerDay ?? 8),
  );
}

/**
 * Every workday off in a set of trips: 1 = full day, 0.5 = half day.
 * Partial-hour days round to the nearest half day (at least a half).
 */
export function daysOffFromTrips(trips: Trip[], member: Member): Picks {
  const out: Picks = {};
  const years = trips.flatMap((t) => [partsOf(toDay(t.start)).y, partsOf(toDay(t.end)).y]);
  if (years.length === 0) return out;
  const hol = holidaySets([member], Math.min(...years), Math.max(...years)).get(member.id);
  for (const t of trips) {
    if (!t.memberIds.includes(member.id)) continue;
    const half = new Set(t.halfDays ?? []);
    const base =
      t.hoursPerDay !== null ? Math.max(0.5, Math.round((t.hoursPerDay / member.policy.hoursPerDay) * 2) / 2) : (t.dayFraction ?? 1);
    for (let n = toDay(t.start); n <= toDay(t.end); n++) {
      if (!isWorkday(member, n, hol)) continue;
      const d = fromDay(n);
      const custom = t.dayHours?.[d];
      out[d] = custom !== undefined ? Math.min(1, custom / member.policy.hoursPerDay) : half.has(d) ? 0.5 : Math.min(1, base);
    }
  }
  return out;
}

/** Days off back into trips: back-to-back days (across weekends and holidays) become one trip. */
export function tripsFromDaysOff(days: Picks, member: Member, makeId: () => string): Trip[] {
  return groupPicks(days, [member]).map((g) => groupToTrip(g, [member.id], makeId(), 'Time off', 'confirmed', member.policy.hoursPerDay));
}

/** Days off split by what they come out of. A day is in at most one. */
export type DaysOff = Record<DayKind, Picks>;

export const DAY_KINDS: DayKind[] = ['pto', 'sick', 'personal'];

export function splitDaysOff(trips: Trip[], member: Member): DaysOff {
  const of = (k: DayKind) => daysOffFromTrips(trips.filter((t) => tripKind(t) === k), member);
  return { pto: of('pto'), sick: of('sick'), personal: of('personal') };
}

const KIND_TITLES: Record<DayKind, string> = { pto: 'Time off', sick: 'Sick', personal: 'Personal day' };

export function tripsFromSplit(days: DaysOff, member: Member, makeId: () => string): Trip[] {
  return DAY_KINDS.flatMap((k) =>
    tripsFromDaysOff(days[k], member, makeId).map((t) => (k === 'pto' ? t : { ...t, title: KIND_TITLES[k], kind: k })),
  );
}

/** Which kind a day is, if it's off. */
export function kindOf(days: DaysOff, d: ISODate): DayKind | null {
  return DAY_KINDS.find((k) => days[k][d] !== undefined) ?? null;
}

/** Set a day to a share of a full day, of one kind; 0 clears it. */
export function setDayKind(days: DaysOff, d: ISODate, share: number, kind: DayKind): DaysOff {
  const next = { pto: { ...days.pto }, sick: { ...days.sick }, personal: { ...days.personal } };
  for (const k of DAY_KINDS) delete next[k][d];
  if (share > 0) next[kind][d] = Math.min(1, share);
  return next;
}

/** Tap a day: off (full) → half day → back to working. A custom amount clears on tap. */
export function cycleDay(days: Picks, d: ISODate): Picks {
  const next = { ...days };
  if (!days[d]) next[d] = 1;
  else if (days[d] === 1) next[d] = 0.5;
  else delete next[d];
  return next;
}

/** Set a day to an exact share of a full day; 0 clears it. */
export function setDay(days: Picks, d: ISODate, share: number): Picks {
  const next = { ...days };
  if (share <= 0) delete next[d];
  else next[d] = Math.min(1, share);
  return next;
}

/** Calendar grid for a month: whole weeks, Sunday first. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = toDay(`${year}-${String(month).padStart(2, '0')}-01`);
  const last = toDay(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`);
  const out: ISODate[] = [];
  for (let n = first - weekdayOf(first); n <= last + (6 - weekdayOf(last)); n++) out.push(fromDay(n));
  return out;
}
