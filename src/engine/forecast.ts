// The forecast engine: a pure day-by-day simulation of each person's balance.
//
//   B(d) = min(cap, B(d-1) + accrual(d)) − used(d) − forfeited(d)
//
// Order within a day: year-end reset, then accrual (clipped at the max balance),
// then any time off taken that day, then a checkpoint overrides the result.

import { partsOf, daysInMonth, fromDay, toDay, weekdayOf, type ISODate } from './dates';
import { memberHolidays } from './holidays';
import type { Household, Member, Policy, Trip } from './types';

export type EventKind = 'accrual' | 'use' | 'capped' | 'forfeit' | 'checkpoint';

export interface ForecastEvent {
  date: ISODate;
  kind: EventKind;
  /** Hours added (+) or removed (−); for 'capped', the hours that weren't earned. */
  hours: number;
  tripId?: string;
}

export interface MemberForecast {
  memberId: string;
  startDay: number;
  /** End-of-day balance for every day from startDay. */
  balances: number[];
  events: ForecastEvent[];
  /** Lowest balance on or after `from`. */
  low: { date: ISODate; balance: number };
  /** First day on or after `from` below the person's buffer. */
  firstBelowBuffer: ISODate | null;
  /** First day on or after `from` below what the employer allows. */
  firstOverdrawn: ISODate | null;
  /** Hours lost to resets or the cap, on or after `from`. */
  lostHours: number;
  balanceOn(date: ISODate): number;
}

export interface ForecastOptions {
  /** Lows and warnings are measured from this date (usually today). */
  from: ISODate;
  /** Last day simulated. */
  until: ISODate;
  /** Leave tentative trips out. */
  confirmedOnly?: boolean;
}

export function rateOn(policy: Policy, day: number): number {
  let rate = policy.rate;
  const changes = [...policy.rateChanges].sort((a, b) => (a.from < b.from ? -1 : 1));
  for (const c of changes) if (toDay(c.from) <= day) rate = c.rate;
  return rate;
}

export function isAccrualDay(policy: Policy, day: number): boolean {
  const anchor = toDay(policy.anchor);
  if (day < anchor) return false;
  const { y, m, d } = partsOf(day);
  const dim = daysInMonth(y, m);
  switch (policy.method) {
    case 'weekly':
      return (day - anchor) % 7 === 0;
    case 'biweekly':
      return (day - anchor) % 14 === 0;
    case 'semimonthly':
      return d === 15 || d === dim;
    case 'monthly':
      return d === Math.min(partsOf(anchor).d, dim);
    case 'annual': {
      const a = partsOf(anchor);
      return m === a.m && d === Math.min(a.d, dim);
    }
  }
}

function isResetDay(policy: Policy, day: number): boolean {
  if (!policy.resetDate || policy.carryoverCap === null) return false;
  const [mm, dd] = policy.resetDate.split('-').map(Number);
  const { m, d } = partsOf(day);
  return m === mm && d === dd;
}

/** Hours each trip takes from this member, by day number. */
export function usageFor(member: Member, trips: Trip[], untilDay: number): Map<number, { hours: number; tripId: string }[]> {
  const startYear = partsOf(toDay(member.startDate)).y;
  const endYear = partsOf(untilDay).y;
  const holidays = new Set(memberHolidays(member, startYear - 1, endYear + 1).map((h) => toDay(h.date)));
  const work = new Set(member.policy.workDays);
  const usage = new Map<number, { hours: number; tripId: string }[]>();
  for (const trip of trips) {
    if (!trip.memberIds.includes(member.id)) continue;
    const hours = trip.hoursPerDay ?? member.policy.hoursPerDay * (trip.dayFraction ?? 1);
    for (let n = toDay(trip.start); n <= toDay(trip.end); n++) {
      if (!work.has(weekdayOf(n)) || holidays.has(n)) continue;
      const list = usage.get(n) ?? [];
      list.push({ hours, tripId: trip.id });
      usage.set(n, list);
    }
  }
  return usage;
}

/** Hours a trip would cost this member (workdays only, holidays free). */
export function tripCost(member: Member, trip: Trip): number {
  if (!trip.memberIds.includes(member.id)) return 0;
  let total = 0;
  for (const list of usageFor(member, [trip], toDay(trip.end)).values()) for (const u of list) total += u.hours;
  return total;
}

export function forecastMember(member: Member, trips: Trip[], opts: ForecastOptions): MemberForecast {
  const policy = member.policy;
  const startDay = toDay(member.startDate);
  const endDay = Math.max(toDay(opts.until), startDay);
  const fromDay_ = Math.max(toDay(opts.from), startDay);
  const included = opts.confirmedOnly ? trips.filter((t) => t.status === 'confirmed') : trips;
  const usage = usageFor(member, included, endDay);
  const checkpoints = new Map(member.checkpoints.map((c) => [toDay(c.date), c.balance]));

  const events: ForecastEvent[] = [];
  let bal = checkpoints.get(startDay) ?? member.startBalance;
  const balances: number[] = [bal];

  for (let n = startDay + 1; n <= endDay; n++) {
    const date = fromDay(n);

    if (isResetDay(policy, n)) {
      const excess = bal - (policy.carryoverCap as number);
      if (excess > 1e-9) {
        bal -= excess;
        events.push({ date, kind: 'forfeit', hours: -excess });
      }
    }

    if (isAccrualDay(policy, n)) {
      const earned = rateOn(policy, n);
      const room = policy.maxBalance === null ? Infinity : Math.max(0, policy.maxBalance - bal);
      const added = Math.min(earned, room);
      bal += added;
      if (added > 0) events.push({ date, kind: 'accrual', hours: added });
      if (earned - added > 1e-9) events.push({ date, kind: 'capped', hours: earned - added });
    }

    for (const u of usage.get(n) ?? []) {
      bal -= u.hours;
      events.push({ date, kind: 'use', hours: -u.hours, tripId: u.tripId });
    }

    const cp = checkpoints.get(n);
    if (cp !== undefined) {
      events.push({ date, kind: 'checkpoint', hours: cp - bal });
      bal = cp;
    }

    balances.push(bal);
  }

  // Measure lows and warnings from `from` on.
  let lowIdx = fromDay_ - startDay;
  let firstBelowBuffer: ISODate | null = null;
  let firstOverdrawn: ISODate | null = null;
  for (let i = fromDay_ - startDay; i < balances.length; i++) {
    const b = balances[i];
    if (b < balances[lowIdx] - 1e-9) lowIdx = i;
    if (firstBelowBuffer === null && b < member.buffer - 1e-9) firstBelowBuffer = fromDay(startDay + i);
    if (firstOverdrawn === null && b < -policy.allowNegative - 1e-9) firstOverdrawn = fromDay(startDay + i);
  }
  if (lowIdx >= balances.length) lowIdx = balances.length - 1;

  const fromISO = fromDay(fromDay_);
  const lostHours = events
    .filter((e) => e.date >= fromISO && (e.kind === 'forfeit' || e.kind === 'capped'))
    .reduce((s, e) => s + Math.abs(e.hours), 0);

  return {
    memberId: member.id,
    startDay,
    balances,
    events,
    low: { date: fromDay(startDay + lowIdx), balance: balances[lowIdx] },
    firstBelowBuffer,
    firstOverdrawn,
    lostHours,
    balanceOn(date: ISODate) {
      const i = toDay(date) - startDay;
      if (i < 0) return member.startBalance;
      return balances[Math.min(i, balances.length - 1)];
    },
  };
}

export function forecastHousehold(h: Household, opts: ForecastOptions): Record<string, MemberForecast> {
  const out: Record<string, MemberForecast> = {};
  for (const m of h.members) out[m.id] = forecastMember(m, h.trips, opts);
  return out;
}

export interface TripImpact {
  memberId: string;
  cost: number;
  before: MemberForecast;
  after: MemberForecast;
  /** The trip pushes this person under their buffer (and they weren't already). */
  breaksBuffer: boolean;
  /** The trip pushes this person past what the employer allows. */
  overdraws: boolean;
}

/** Compare the forecast with and without a draft trip (a new trip, or an edit of an existing one). */
export function tripImpact(h: Household, draft: Trip, opts: ForecastOptions): TripImpact[] {
  const others = h.trips.filter((t) => t.id !== draft.id);
  return h.members
    .filter((m) => draft.memberIds.includes(m.id))
    .map((m) => {
      const before = forecastMember(m, others, opts);
      const after = forecastMember(m, [...others, draft], opts);
      return {
        memberId: m.id,
        cost: tripCost(m, draft),
        before,
        after,
        breaksBuffer: after.firstBelowBuffer !== null && before.firstBelowBuffer === null,
        overdraws: after.firstOverdrawn !== null && before.firstOverdrawn === null,
      };
    });
}

export type EarliestResult =
  | { ok: true; start: ISODate; end: ISODate }
  /** Someone is already under their buffer from existing plans. */
  | { ok: false; reason: 'already-below'; memberId: string; date: ISODate }
  /** No start date before the horizon works. */
  | { ok: false; reason: 'none' };

/**
 * The first start date (a workday for everyone going) where a trip of `workdays`
 * workdays keeps everyone at or above their buffer through `until`.
 */
export function findEarliest(
  h: Household,
  params: { memberIds: string[]; workdays: number; from: ISODate; until: ISODate; hoursPerDay?: number | null },
): EarliestResult {
  const members = h.members.filter((m) => params.memberIds.includes(m.id));
  if (members.length === 0 || params.workdays < 1) return { ok: false, reason: 'none' };
  const isWork = (n: number) => members.every((m) => m.policy.workDays.includes(weekdayOf(n)));
  const opts: ForecastOptions = { from: params.from, until: params.until };
  const lastStart = toDay(params.until) - 1;

  // Someone already under their buffer without the trip can never pass.
  for (const m of members) {
    const below = forecastMember(m, h.trips, opts).firstBelowBuffer;
    if (below !== null) return { ok: false, reason: 'already-below', memberId: m.id, date: below };
  }

  for (let s = toDay(params.from) + 1; s <= lastStart; s++) {
    if (!isWork(s)) continue;
    let count = 0;
    let e = s;
    for (; e <= lastStart + 60; e++) {
      if (isWork(e)) count++;
      if (count === params.workdays) break;
    }
    const trial: Trip = {
      id: '__trial__',
      title: 'Trial',
      start: fromDay(s),
      end: fromDay(e),
      memberIds: params.memberIds,
      hoursPerDay: params.hoursPerDay ?? null,
      status: 'tentative',
    };
    const ok = members.every((m) => forecastMember(m, [...h.trips, trial], opts).firstBelowBuffer === null);
    if (ok) return { ok: true, start: trial.start, end: trial.end };
  }
  return { ok: false, reason: 'none' };
}

/** Next forfeiture on or after `from`, summed across the day. */
export function nextLoss(f: MemberForecast, from: ISODate): { date: ISODate; hours: number } | null {
  const loss = f.events.find((e) => e.date >= from && (e.kind === 'forfeit' || e.kind === 'capped'));
  if (!loss) return null;
  const hours = f.events
    .filter((e) => e.date === loss.date && (e.kind === 'forfeit' || e.kind === 'capped'))
    .reduce((s, e) => s + Math.abs(e.hours), 0);
  return { date: loss.date, hours };
}
