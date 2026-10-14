import { describe, expect, it } from 'vitest';
import { setDayKind, splitDaysOff, tripsFromSplit } from './plan';
import { forecastMember, forecastPersonal, forecastSick } from './forecast';
import type { Member, SickPolicy } from './types';

const base: Member = {
  id: 'me', name: 'Me', color: '#000', startDate: '2026-09-19', startBalance: 40, buffer: 0,
  holidaySet: 'none', holidays: [], checkpoints: [],
  policy: { method: 'biweekly', anchor: '2026-09-19', rate: 8, rateChanges: [], maxBalance: null, carryoverCap: null,
    resetDate: null, allowNegative: 0, hoursPerDay: 8, workDays: [1, 2, 3, 4, 5] },
};
const sick = (patch: Partial<SickPolicy>): Member => ({
  ...base,
  sick: { separate: true, method: 'payday', rate: 2, grantDate: '01-01', resetsYearly: false, maxBalance: null, asOf: '2026-09-19', balance: 16, ...patch },
});
const opts = { from: '2026-09-19', until: '2027-03-01' };
let n = 0;
const id = () => `t${n++}`;

describe('sick days', () => {
  const days = setDayKind(setDayKind({ pto: {}, sick: {}, personal: {} }, '2026-10-05', 1, 'pto'), '2026-10-06', 1, 'sick');

  it('keeps time off and sick days apart, one kind per day', () => {
    const trips = tripsFromSplit(days, base, id);
    expect(trips.filter((t) => t.kind === 'sick')).toHaveLength(1);
    expect(splitDaysOff(trips, base)).toEqual(days);
    const moved = setDayKind(days, '2026-10-05', 0.5, 'sick');
    expect(moved.pto['2026-10-05']).toBeUndefined();
    expect(moved.sick['2026-10-05']).toBe(0.5);
  });

  it('come out of PTO by default', () => {
    const trips = tripsFromSplit(days, base, id);
    expect(forecastMember(base, trips, opts).balanceOn('2026-10-06')).toBe(40 + 8 - 16); // payday Oct 3
    expect(forecastSick(base, trips, opts)).toBeNull();
  });

  it('come out of their own balance when it is separate, earned each payday', () => {
    const m = sick({});
    const trips = tripsFromSplit(days, m, id);
    expect(forecastMember(m, trips, opts).balanceOn('2026-10-06')).toBe(40 + 8 - 8);
    expect(forecastSick(m, trips, opts)!.balanceOn('2026-10-06')).toBe(16 + 2 - 8);
  });

  it('can be a yearly grant that resets', () => {
    const m = sick({ method: 'annual', rate: 40, resetsYearly: true, grantDate: '01-01' });
    const f = forecastSick(m, tripsFromSplit(days, m, id), opts)!;
    expect(f.balanceOn('2026-12-31')).toBe(8);
    expect(f.balanceOn('2027-01-01')).toBe(40);
    const keep = forecastSick(sick({ method: 'annual', rate: 40, grantDate: '01-01' }), [], opts)!;
    expect(keep.balanceOn('2027-01-01')).toBe(56);
  });
});

describe('personal days', () => {
  const m: Member = { ...base, personal: { daysPerYear: 3, resetDate: '01-01', asOf: '2026-09-19', balance: 16 } };
  const days = setDayKind(setDayKind({ pto: {}, sick: {}, personal: {} }, '2026-10-05', 1, 'personal'), '2026-10-06', 1, 'pto');

  it('come out of their own balance, not PTO, and reset each year', () => {
    const trips = tripsFromSplit(days, m, id);
    expect(trips.find((t) => t.kind === 'personal')?.title).toBe('Personal day');
    expect(forecastMember(m, trips, opts).balanceOn('2026-10-06')).toBe(40 + 8 - 8);
    const f = forecastPersonal(m, trips, opts)!;
    expect(f.balanceOn('2026-10-05')).toBe(8);
    expect(f.balanceOn('2026-12-31')).toBe(8);
    expect(f.balanceOn('2027-01-01')).toBe(24); // unused lost, 3 new days
  });

  it('count as PTO when personal days aren’t set up', () => {
    const trips = tripsFromSplit(days, base, id);
    expect(forecastMember(base, trips, opts).balanceOn('2026-10-06')).toBe(40 + 8 - 16);
    expect(forecastPersonal(base, trips, opts)).toBeNull();
  });
});
