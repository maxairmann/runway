// Sample household for the "Try the demo" button. Dates are relative to today,
// so the demo never goes stale.

import { addDays, fromDay, toDay, todayISO, weekdayOf, type ISODate } from '../engine/dates';
import type { Household } from '../engine/types';
import { newId } from './ids';

/** The first date on or after `iso` that falls on `weekday` (0 = Sunday). */
function onOrAfter(iso: ISODate, weekday: number): ISODate {
  const n = toDay(iso);
  return fromDay(n + ((weekday - weekdayOf(n) + 7) % 7));
}

export function makeDemo(today: ISODate = todayISO()): Household {
  const start = addDays(today, -21);
  const samPayday = onOrAfter(start, 5); // Fridays
  const sam = 'demo_sam';
  const jordan = 'demo_jordan';

  const weekend = onOrAfter(addDays(today, 33), 5);
  const dentist = onOrAfter(addDays(today, 12), 2);
  const wedding = onOrAfter(addDays(today, 115), 4);
  const lisbon = onOrAfter(addDays(today, 240), 1);

  return {
    id: 'demo',
    name: 'Sam & Jordan',
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: sam,
        name: 'Sam',
        color: '#1D7F86',
        startDate: start,
        startBalance: 22,
        buffer: 16,
        holidaySet: 'common',
        holidays: [],
        checkpoints: [],
        policy: {
          method: 'biweekly',
          anchor: samPayday,
          rate: 6.15,
          rateChanges: [],
          maxBalance: 200,
          carryoverCap: null,
          resetDate: null,
          allowNegative: 0,
          hoursPerDay: 8,
          workDays: [1, 2, 3, 4, 5],
        },
      },
      {
        id: jordan,
        name: 'Jordan',
        color: '#7B4E9E',
        startDate: start,
        startBalance: 88,
        buffer: 8,
        holidaySet: 'federal',
        holidays: [],
        checkpoints: [],
        policy: {
          method: 'semimonthly',
          anchor: start,
          rate: 6.67,
          rateChanges: [],
          maxBalance: null,
          carryoverCap: 40,
          resetDate: '01-01',
          allowNegative: 0,
          hoursPerDay: 8,
          workDays: [1, 2, 3, 4, 5],
        },
      },
    ],
    trips: [
      {
        id: newId('trip'),
        title: 'Dentist',
        start: dentist,
        end: dentist,
        memberIds: [sam],
        hoursPerDay: 4,
        status: 'confirmed',
      },
      {
        id: newId('trip'),
        title: 'Long weekend in Asheville',
        start: weekend,
        end: addDays(weekend, 3),
        memberIds: [sam, jordan],
        hoursPerDay: null,
        status: 'confirmed',
      },
      {
        id: newId('trip'),
        title: "Priya's wedding",
        start: wedding,
        end: addDays(wedding, 1),
        memberIds: [jordan],
        hoursPerDay: null,
        status: 'confirmed',
      },
      {
        id: newId('trip'),
        title: 'Lisbon and Porto',
        start: lisbon,
        end: addDays(lisbon, 11),
        memberIds: [sam, jordan],
        hoursPerDay: null,
        status: 'tentative',
      },
    ],
  };
}
