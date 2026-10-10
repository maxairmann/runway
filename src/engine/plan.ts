// Planning mode: days picked on the calendar, grouped into trips.

import { daysInMonth, fromDay, partsOf, toDay, weekdayOf, type ISODate } from './dates';
import { memberHolidays } from './holidays';
import type { Member, Trip, TripStatus } from './types';

/** Picked days: 1 = full day off, 0.5 = half day. */
export type Picks = Record<ISODate, number>;

export interface PickGroup {
  start: ISODate;
  end: ISODate;
  /** The picked days, in order. */
  days: ISODate[];
  halfDays: ISODate[];
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
      cur = { start: d, end: d, days: [d], halfDays: [] };
      groups.push(cur);
    }
    if (picks[d] === 0.5) cur.halfDays.push(d);
  }
  return groups;
}

export function groupToTrip(g: PickGroup, memberIds: string[], id: string, title: string, status: TripStatus): Trip {
  return {
    id,
    title,
    start: g.start,
    end: g.end,
    memberIds,
    hoursPerDay: null,
    dayFraction: 1,
    halfDays: g.halfDays.length > 0 ? g.halfDays : undefined,
    status,
  };
}

/** Trips for picks, for previewing them in the forecast before they're saved. */
export function picksAsTrips(picks: Picks, members: Member[], memberIds: string[]): Trip[] {
  const going = members.filter((m) => memberIds.includes(m.id));
  return groupPicks(picks, going).map((g, i) => groupToTrip(g, memberIds, `__pick_${i}__`, 'Picked days', 'tentative'));
}

/** Calendar grid for a month: whole weeks, Sunday first. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = toDay(`${year}-${String(month).padStart(2, '0')}-01`);
  const last = toDay(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`);
  const out: ISODate[] = [];
  for (let n = first - weekdayOf(first); n <= last + (6 - weekdayOf(last)); n++) out.push(fromDay(n));
  return out;
}
