// The forecast engine: a pure day-by-day simulation of each person's balance.
//
//   B(d) = min(cap, B(d-1) + accrual(d)) − used(d) − forfeited(d)
//
// Order within a day: year-end reset, then accrual (clipped at the max balance),
// then any time off taken that day, then a checkpoint overrides the result.

import { partsOf, daysInMonth, fromDay, isoOf, toDay, weekdayOf, type ISODate } from './dates';
import { memberHolidays } from './holidays';
import { tripKind, type DayKind, type Household, type Member, type Policy, type Trip } from './types';

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

// Holiday sets are rebuilt only when a member's settings change (planning checks thousands of days per tap).
const holidayCache = new WeakMap<Member, Map<string, Set<number>>>();
function holidaySet(member: Member, fromYear: number, toYear: number): Set<number> {
  let byRange = holidayCache.get(member);
  if (!byRange) holidayCache.set(member, (byRange = new Map()));
  const key = `${fromYear}-${toYear}`;
  let set = byRange.get(key);
  if (!set) byRange.set(key, (set = new Set(memberHolidays(member, fromYear, toYear).map((h) => toDay(h.date)))));
  return set;
}

/** Hours each trip takes from this member, by day number. */
export function usageFor(member: Member, trips: Trip[], untilDay: number): Map<number, { hours: number; tripId: string }[]> {
  const startYear = partsOf(toDay(member.startDate)).y;
  const endYear = partsOf(untilDay).y;
  const holidays = holidaySet(member, startYear - 1, endYear + 1);
  const work = new Set(member.policy.workDays);
  const usage = new Map<number, { hours: number; tripId: string }[]>();
  const sickSeparate = !!member.sick?.separate;
  const personalOn = (member.personal?.daysPerYear ?? 0) > 0;
  for (const trip of trips) {
    if (!trip.memberIds.includes(member.id)) continue;
    // These come out of their own balances instead.
    const k = tripKind(trip);
    if ((k === 'sick' && sickSeparate) || (k === 'personal' && personalOn)) continue;
    const hours = trip.hoursPerDay ?? member.policy.hoursPerDay * (trip.dayFraction ?? 1);
    const half = new Set((trip.halfDays ?? []).map(toDay));
    for (let n = toDay(trip.start); n <= toDay(trip.end); n++) {
      if (!work.has(weekdayOf(n)) || holidays.has(n)) continue;
      const list = usage.get(n) ?? [];
      const custom = trip.dayHours?.[fromDay(n)];
      list.push({ hours: custom ?? (half.has(n) ? member.policy.hoursPerDay / 2 : hours), tripId: trip.id });
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

  // Precompute what the daily loop needs, and walk the calendar without building Date objects per day.
  const anchor = toDay(policy.anchor);
  const anchorParts = partsOf(anchor);
  const [resetM, resetD] = policy.resetDate && policy.carryoverCap !== null ? policy.resetDate.split('-').map(Number) : [0, 0];
  const changes = [...policy.rateChanges].map((c) => ({ day: toDay(c.from), rate: c.rate })).sort((a, b) => a.day - b.day);
  let rate = policy.rate;
  let nextChange = 0;
  let { y, m, d } = partsOf(startDay);
  let dim = daysInMonth(y, m);

  for (let n = startDay + 1; n <= endDay; n++) {
    d++;
    if (d > dim) {
      d = 1;
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      dim = daysInMonth(y, m);
    }
    while (nextChange < changes.length && changes[nextChange].day <= n) rate = changes[nextChange++].rate;

    if (resetM && m === resetM && d === resetD) {
      const excess = bal - (policy.carryoverCap as number);
      if (excess > 1e-9) {
        bal -= excess;
        events.push({ date: fromDay(n), kind: 'forfeit', hours: -excess });
      }
    }

    let accrues = false;
    if (n >= anchor) {
      switch (policy.method) {
        case 'weekly':
          accrues = (n - anchor) % 7 === 0;
          break;
        case 'biweekly':
          accrues = (n - anchor) % 14 === 0;
          break;
        case 'semimonthly':
          accrues = d === 15 || d === dim;
          break;
        case 'monthly':
          accrues = d === Math.min(anchorParts.d, dim);
          break;
        case 'annual':
          accrues = m === anchorParts.m && d === Math.min(anchorParts.d, dim);
          break;
      }
    }
    if (accrues) {
      const room = policy.maxBalance === null ? Infinity : Math.max(0, policy.maxBalance - bal);
      const added = Math.min(rate, room);
      bal += added;
      if (added > 0) events.push({ date: fromDay(n), kind: 'accrual', hours: added });
      if (rate - added > 1e-9) events.push({ date: fromDay(n), kind: 'capped', hours: rate - added });
    }

    const used = usage.get(n);
    if (used) {
      for (const u of used) {
        bal -= u.hours;
        events.push({ date: fromDay(n), kind: 'use', hours: -u.hours, tripId: u.tripId });
      }
    }

    const cp = checkpoints.get(n);
    if (cp !== undefined) {
      events.push({ date: fromDay(n), kind: 'checkpoint', hours: cp - bal });
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

/** The first day on or after `date` below what the employer allows, or null. */
export function overdrawnFrom(f: MemberForecast, member: Member, date: ISODate): ISODate | null {
  const floor = -member.policy.allowNegative - 1e-9;
  for (let i = Math.max(0, toDay(date) - f.startDay); i < f.balances.length; i++) {
    if (f.balances[i] < floor) return fromDay(f.startDay + i);
  }
  return null;
}

/** The worst shortfall on or after `from`: how far below the allowed floor, and when. Null if there is none. */
export function worstShortfall(f: MemberForecast, member: Member, from: ISODate): { date: ISODate; hours: number } | null {
  const floor = -member.policy.allowNegative;
  let worst: { date: ISODate; hours: number } | null = null;
  for (let i = Math.max(0, toDay(from) - f.startDay); i < f.balances.length; i++) {
    const short = floor - f.balances[i];
    if (short > 1e-9 && (!worst || short > worst.hours + 1e-9)) worst = { date: fromDay(f.startDay + i), hours: short };
  }
  return worst;
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
  /** From the trip's first day on, this person would be past what the employer allows. */
  overdraws: boolean;
  /** The first such day. */
  overdrawnOn: ISODate | null;
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
        overdrawnOn: overdrawnFrom(after, m, draft.start),
        overdraws: overdrawnFrom(after, m, draft.start) !== null,
      };
    });
}

export type EarliestResult =
  | { ok: true; start: ISODate; end: ISODate }
  /** No start date before the horizon works. */
  | { ok: false; reason: 'none' };

/**
 * The first start date after `from` (a workday for everyone going) where a trip of
 * `workdays` workdays keeps everyone within what their employer allows, from the
 * trip's first day through `until`. A shortfall earlier than the trip doesn't block it.
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

  // A trip can't start before the last day someone is already short: it would only make that worse.
  let clearFrom = toDay(params.from) + 1;
  for (const m of members) {
    const f = forecastMember(m, h.trips, opts);
    const floor = -m.policy.allowNegative - 1e-9;
    for (let i = f.balances.length - 1; i >= 0; i--) {
      if (f.balances[i] < floor) {
        clearFrom = Math.max(clearFrom, f.startDay + i + 1);
        break;
      }
    }
  }

  // Days already taken by a trip for anyone going can't be part of a new one.
  const taken = new Set<number>();
  for (const t of h.trips) {
    if (!t.memberIds.some((id) => params.memberIds.includes(id))) continue;
    for (let n = toDay(t.start); n <= toDay(t.end); n++) taken.add(n);
  }

  for (let s = clearFrom; s <= lastStart; s++) {
    if (!isWork(s) || taken.has(s)) continue;
    let count = 0;
    let e = s;
    let overlaps = false;
    for (; e <= lastStart + 60; e++) {
      if (taken.has(e)) {
        overlaps = true;
        break;
      }
      if (isWork(e)) count++;
      if (count === params.workdays) break;
    }
    if (overlaps) continue;
    const trial: Trip = {
      id: '__trial__',
      title: 'Trial',
      start: fromDay(s),
      end: fromDay(e),
      memberIds: params.memberIds,
      hoursPerDay: params.hoursPerDay ?? null,
      status: 'tentative',
    };
    const ok = members.every((m) => overdrawnFrom(forecastMember(m, [...h.trips, trial], opts), m, trial.start) === null);
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

// Sick time with its own balance runs through the same engine as a stand-in member.
const sickStandIns = new WeakMap<Member, Member>();

/** The sick balance as a member of its own, or null when sick days come out of PTO. */
export function sickMember(member: Member): Member | null {
  const s = member.sick;
  if (!s?.separate) return null;
  let sm = sickStandIns.get(member);
  if (!sm) {
    const annual = s.method === 'annual';
    const [gm, gd] = s.grantDate.split('-').map(Number);
    const resets = annual && s.resetsYearly;
    sm = {
      ...member,
      startDate: s.asOf,
      startBalance: s.balance,
      checkpoints: [],
      sick: undefined,
      personal: undefined,
      policy: {
        ...member.policy,
        method: annual ? 'annual' : member.policy.method,
        anchor: annual ? isoOf(partsOf(toDay(s.asOf)).y - 1, gm, gd) : member.policy.anchor,
        rate: s.rate,
        rateChanges: [],
        maxBalance: s.maxBalance,
        carryoverCap: resets ? 0 : null,
        resetDate: resets ? s.grantDate : null,
        allowNegative: 0,
      },
    };
    sickStandIns.set(member, sm);
  }
  return sm;
}

/** Forecast of the separate sick balance, or null when sick days come out of PTO. */
export function forecastSick(member: Member, trips: Trip[], opts: ForecastOptions): MemberForecast | null {
  const sm = sickMember(member);
  return sm ? forecastMember(sm, trips.filter((t) => tripKind(t) === 'sick'), opts) : null;
}

const personalStandIns = new WeakMap<Member, Member>();

/** Personal days as a member of their own: granted yearly, unused ones lost on the reset date. Null when there are none. */
export function personalMember(member: Member): Member | null {
  const p = member.personal;
  if (!p || p.daysPerYear <= 0) return null;
  let pm = personalStandIns.get(member);
  if (!pm) {
    const [rm, rd] = p.resetDate.split('-').map(Number);
    pm = {
      ...member,
      startDate: p.asOf,
      startBalance: p.balance,
      checkpoints: [],
      sick: undefined,
      personal: undefined,
      policy: {
        ...member.policy,
        method: 'annual',
        anchor: isoOf(partsOf(toDay(p.asOf)).y - 1, rm, rd),
        rate: p.daysPerYear * member.policy.hoursPerDay,
        rateChanges: [],
        maxBalance: null,
        carryoverCap: 0,
        resetDate: p.resetDate,
        allowNegative: 0,
      },
    };
    personalStandIns.set(member, pm);
  }
  return pm;
}

export function forecastPersonal(member: Member, trips: Trip[], opts: ForecastOptions): MemberForecast | null {
  const pm = personalMember(member);
  return pm ? forecastMember(pm, trips.filter((t) => tripKind(t) === 'personal'), opts) : null;
}

/** The stand-in whose balance a kind of day comes out of (the member itself for PTO, or when that kind isn't tracked separately). */
export function memberFor(member: Member, kind: DayKind): Member {
  if (kind === 'sick') return sickMember(member) ?? member;
  if (kind === 'personal') return personalMember(member) ?? member;
  return member;
}
