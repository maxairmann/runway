import { describe, expect, it } from 'vitest';
import { findEarliest, forecastMember, tripCost, tripImpact } from './forecast';
import { presetHolidays } from './holidays';
import { addDays, toDay, weekdayOf } from './dates';
import type { Household, Member, Trip } from './types';

function member(overrides: Partial<Member> = {}, policy: Partial<Member['policy']> = {}): Member {
  return {
    id: 'max',
    name: 'Max',
    color: '#000',
    startDate: '2026-09-19',
    startBalance: 5.18,
    buffer: 0,
    holidaySet: 'none',
    holidays: [],
    checkpoints: [],
    ...overrides,
    policy: {
      method: 'biweekly',
      anchor: '2026-09-19',
      rate: 7.69,
      rateChanges: [],
      maxBalance: null,
      carryoverCap: null,
      resetDate: null,
      allowNegative: 0,
      hoursPerDay: 8,
      workDays: [1, 2, 3, 4, 5],
      ...policy,
    },
  };
}

function trip(id: string, start: string, end: string, memberIds = ['max'], hoursPerDay: number | null = null): Trip {
  return { id, title: id, start, end, memberIds, hoursPerDay, status: 'confirmed' };
}

// Days booked in the "All I Ever Wanted" sheet.
const sheetTrips = [
  trip('mon-before-thanksgiving', '2026-11-23', '2026-11-23'),
  trip('fri-after-thanksgiving', '2026-11-27', '2026-11-27'),
  trip('january', '2027-01-11', '2027-01-13'),
];

describe('golden test: matches the spreadsheet on every payday', () => {
  const f = forecastMember(member(), sheetTrips, { from: '2026-09-19', until: '2028-09-24' });
  const expected: [string, number][] = [
    ['2026-09-19', 5.18],
    ['2026-10-03', 12.87],
    ['2026-11-14', 35.94],
    ['2026-11-28', 27.63],
    ['2026-12-26', 43.01],
    ['2027-01-09', 50.7],
    ['2027-01-23', 34.39],
    ['2027-06-26', 118.98],
    ['2028-09-16', 365.06],
  ];
  for (const [date, balance] of expected) {
    it(`${date} → ${balance}`, () => expect(f.balanceOn(date)).toBeCloseTo(balance, 2));
  }

  it('reports the real low between paydays, which the sheet hides', () => {
    // 35.94 on 11/14, minus two days off before the 11/28 payday.
    const fromNov = forecastMember(member(), sheetTrips, { from: '2026-11-15', until: '2027-03-01' });
    expect(fromNov.low.date).toBe('2026-11-27');
    expect(fromNov.low.balance).toBeCloseTo(19.94, 2);
  });
});

describe('time off cost', () => {
  it('skips weekends', () => {
    expect(tripCost(member(), trip('week', '2026-11-16', '2026-11-22'))).toBe(40);
  });

  it('skips holidays', () => {
    const m = member({ holidaySet: 'common' });
    // Mon–Fri of Thanksgiving week: Thursday and Friday are company holidays.
    expect(tripCost(m, trip('tg', '2026-11-23', '2026-11-27'))).toBe(24);
  });

  it('charges half of each person’s own full day for a half-day trip', () => {
    const half = { ...trip('half', '2026-11-23', '2026-11-24'), dayFraction: 0.5 };
    expect(tripCost(member(), half)).toBe(8);
    expect(tripCost(member({}, { hoursPerDay: 7.5 }), half)).toBe(7.5);
  });

  it('honors partial days', () => {
    expect(tripCost(member(), trip('half', '2026-11-23', '2026-11-23', ['max'], 4))).toBe(4);
  });

  it('observes fixed holidays on the nearest weekday', () => {
    const dates = presetHolidays('federal', 2027, 2027).map((h) => h.date);
    expect(dates).toContain('2027-07-05'); // July 4, 2027 is a Sunday
    expect(dates).toContain('2027-12-24'); // Dec 25, 2027 is a Saturday
    expect(dates).toContain('2027-11-25'); // Thanksgiving
  });
});

describe('employer rules', () => {
  it('stops accruing at the max balance and logs the lost hours', () => {
    const f = forecastMember(member({}, { maxBalance: 20 }), [], { from: '2026-09-19', until: '2027-01-01' });
    expect(Math.max(...f.balances)).toBeCloseTo(20, 5);
    expect(f.lostHours).toBeGreaterThan(0);
  });

  it('forfeits everything above the carryover cap on the reset date', () => {
    const m = member({}, { carryoverCap: 16, resetDate: '01-01' });
    const f = forecastMember(m, [], { from: '2026-09-19', until: '2027-01-02' });
    expect(f.balanceOn('2026-12-31')).toBeCloseTo(59.01, 2); // no days off booked here
    expect(f.balanceOn('2027-01-01')).toBeCloseTo(16, 2);
    expect(f.lostHours).toBeCloseTo(43.01, 2);
  });

  it('switches to a new rate on its effective date', () => {
    const m = member({}, { rateChanges: [{ from: '2026-10-17', rate: 10 }] });
    const f = forecastMember(m, [], { from: '2026-09-19', until: '2026-11-01' });
    expect(f.balanceOn('2026-10-03')).toBeCloseTo(12.87, 2);
    expect(f.balanceOn('2026-10-17')).toBeCloseTo(22.87, 2);
  });

  it('treats a checkpoint as the true balance and forecasts from it', () => {
    const m = member({ checkpoints: [{ date: '2026-11-15', balance: 30 }] });
    const f = forecastMember(m, [], { from: '2026-09-19', until: '2026-12-01' });
    expect(f.balanceOn('2026-11-15')).toBe(30);
    expect(f.balanceOn('2026-11-28')).toBeCloseTo(37.69, 2);
  });

  it('flags going past the allowed negative', () => {
    const m = member({}, { allowNegative: 8 });
    const f = forecastMember(m, [trip('big', '2026-09-21', '2026-09-25')], { from: '2026-09-19', until: '2026-10-10' });
    expect(f.firstOverdrawn).toBe('2026-09-22'); // 5.18 − 16 = −10.82, past the −8 allowed
  });
});

describe('household planning', () => {
  const partner: Member = { ...member({ id: 'adina', name: 'Partner', startBalance: 40 }), id: 'adina' };
  const h: Household = { id: 'h', name: 'Home', members: [member(), partner], trips: [], updatedAt: '' };

  const opts = { from: '2026-09-19', until: '2027-09-30' };

  it('finds the earliest week both people can take, and no earlier start works', () => {
    const r = findEarliest(h, { memberIds: ['max', 'adina'], workdays: 5, ...opts });
    if (!r.ok) throw new Error('expected a result');
    // Five workdays, Monday to Friday.
    expect(tripCost(member(), trip('t', r.start, r.end))).toBe(40);
    expect(forecastMember(member(), [trip('t', r.start, r.end)], opts).firstBelowBuffer).toBeNull();
    // The workday before is too early for Max (the partner has 40 hours from day one).
    const prevStart = addDays(r.start, weekdayOf(toDay(r.start)) === 1 ? -3 : -1);
    const prevEnd = addDays(r.end, weekdayOf(toDay(r.end)) === 1 ? -3 : -1);
    expect(forecastMember(member(), [trip('t', prevStart, prevEnd)], opts).firstBelowBuffer).not.toBeNull();
  });

  it('never suggests dates that overlap a trip already planned', () => {
    const rich: Member = { ...member({ startBalance: 200 }) };
    const planned: Household = { ...h, members: [rich], trips: [trip('booked', '2026-10-01', '2026-10-09')] };
    const r = findEarliest(planned, { memberIds: ['max'], workdays: 5, from: '2026-09-28', until: '2027-09-30' });
    if (!r.ok) throw new Error('expected a result');
    expect(r.start > '2026-10-09' || r.end < '2026-10-01').toBe(true);
    expect(r.start).toBe('2026-10-12');
  });

  it('explains when existing plans already break someone’s buffer', () => {
    const busy: Household = { ...h, trips: [trip('big', '2026-09-21', '2026-09-25')] };
    const r = findEarliest(busy, { memberIds: ['max'], workdays: 1, ...opts });
    expect(r).toEqual({ ok: false, reason: 'already-below', memberId: 'max', date: '2026-09-21' });
  });

  it('shows the impact of a draft trip per person', () => {
    const draft = trip('draft', '2026-10-05', '2026-10-09', ['max', 'adina']);
    const impact = tripImpact(h, draft, { from: '2026-09-19', until: '2027-09-30' });
    const max = impact.find((i) => i.memberId === 'max')!;
    const ad = impact.find((i) => i.memberId === 'adina')!;
    expect(max.cost).toBe(40);
    expect(max.breaksBuffer).toBe(true);
    expect(ad.breaksBuffer).toBe(false);
  });
});
