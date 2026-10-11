// Sample plan for "Try the demo". Dates are relative to today, so the demo never goes stale.

import { addDays, fromDay, toDay, todayISO, weekdayOf, type ISODate } from '../engine/dates';
import type { Household } from '../engine/types';
import { newId } from './ids';

/** The first date on or after `iso` that falls on `weekday` (0 = Sunday). */
function onOrAfter(iso: ISODate, weekday: number): ISODate {
  const n = toDay(iso);
  return fromDay(n + ((weekday - weekdayOf(n) + 7) % 7));
}

const SAM = 'demo_sam';

function demoStart(today: ISODate): ISODate {
  return addDays(today, -21);
}

export function makeDemo(today: ISODate = todayISO()): Household {
  const start = demoStart(today);
  const weekend = onOrAfter(addDays(today, 33), 5);
  const dentist = onOrAfter(addDays(today, 12), 2);
  const wedding = onOrAfter(addDays(today, 115), 4);
  const lisbon = onOrAfter(addDays(today, 240), 1);
  const sickDay = onOrAfter(addDays(today, -9), 3);

  return {
    id: 'demo',
    name: "Sam's plan",
    units: 'hours',
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: SAM,
        name: 'Sam',
        color: '#1D7F86',
        startDate: start,
        startBalance: 88,
        buffer: 0,
        holidaySet: 'none',
        holidays: [],
        usHolidays: true,
        jewishHolidays: true,
        // Labeled but worked: MLK Day, Presidents' Day, Juneteenth, Columbus Day, Veterans Day, and the Jewish holidays.
        paidHolidays: ["New Year's Day", 'Memorial Day', 'Independence Day', 'Labor Day', 'Thanksgiving', 'Day after Thanksgiving', 'Christmas Day'],
        checkpoints: [],
        sick: { separate: true, method: 'payday', rate: 1.5, grantDate: '01-01', resetsYearly: false, maxBalance: null, asOf: start, balance: 20 },
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
      { id: newId('trip'), title: 'Sick', start: sickDay, end: sickDay, memberIds: [SAM], hoursPerDay: null, status: 'confirmed', sick: true },
      { id: newId('trip'), title: 'Dentist', start: dentist, end: dentist, memberIds: [SAM], hoursPerDay: null, halfDays: [dentist], status: 'confirmed' },
      { id: 'demo_weekend', title: 'Long weekend in Asheville', start: weekend, end: addDays(weekend, 3), memberIds: [SAM], hoursPerDay: null, status: 'confirmed' },
      { id: newId('trip'), title: "Priya's wedding", start: wedding, end: addDays(wedding, 1), memberIds: [SAM], hoursPerDay: null, status: 'confirmed' },
      { id: 'demo_lisbon', title: 'Lisbon and Porto', start: lisbon, end: addDays(lisbon, 11), memberIds: [SAM], hoursPerDay: null, status: 'confirmed' },
    ],
  };
}
