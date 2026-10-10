import { describe, expect, it } from 'vitest';
import { groupPicks, monthGrid, picksAsTrips } from './plan';
import { tripCost } from './forecast';
import type { Member } from './types';

const me: Member = {
  id: 'me', name: 'Me', color: '#000', startDate: '2026-09-19', startBalance: 40, buffer: 0,
  holidaySet: 'common', holidays: [], checkpoints: [],
  policy: { method: 'biweekly', anchor: '2026-09-19', rate: 7.69, rateChanges: [], maxBalance: null, carryoverCap: null,
    resetDate: null, allowNegative: 0, hoursPerDay: 8, workDays: [1, 2, 3, 4, 5] },
};

describe('planning picks', () => {
  it('joins Friday and Monday into one trip across the weekend', () => {
    const g = groupPicks({ '2026-11-13': 1, '2026-11-16': 1 }, [me]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ start: '2026-11-13', end: '2026-11-16' });
  });

  it('joins across a holiday, and splits when a workday is skipped', () => {
    // Wed Nov 25 and Mon Nov 30: Thanksgiving and the day after are company holidays.
    expect(groupPicks({ '2026-11-25': 1, '2026-11-30': 1 }, [me])).toHaveLength(1);
    // Mon and Wed with Tuesday worked in between.
    expect(groupPicks({ '2026-11-16': 1, '2026-11-18': 1 }, [me])).toHaveLength(2);
  });

  it('charges half days at half', () => {
    const [trip] = picksAsTrips({ '2026-11-16': 1, '2026-11-17': 0.5 }, [me], ['me']);
    expect(trip.halfDays).toEqual(['2026-11-17']);
    expect(tripCost(me, trip)).toBe(12);
  });

  it('builds whole Sunday-first weeks for a month', () => {
    const g = monthGrid(2026, 11);
    expect(g[0]).toBe('2026-11-01'); // Nov 1, 2026 is a Sunday
    expect(g.length % 7).toBe(0);
    expect(g.at(-1)).toBe('2026-12-05');
  });
});
