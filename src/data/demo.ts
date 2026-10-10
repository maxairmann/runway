// Sample plan for "Try the demo". It starts as one person; "Add a partner"
// brings in a second person to show planning together. Dates are relative to
// today, so the demo never goes stale.

import { addDays, fromDay, toDay, todayISO, weekdayOf, type ISODate } from '../engine/dates';
import type { Household, Member } from '../engine/types';
import { newId } from './ids';

/** The first date on or after `iso` that falls on `weekday` (0 = Sunday). */
function onOrAfter(iso: ISODate, weekday: number): ISODate {
  const n = toDay(iso);
  return fromDay(n + ((weekday - weekdayOf(n) + 7) % 7));
}

const SAM = 'demo_sam';
const JORDAN = 'demo_jordan';

function demoStart(today: ISODate): ISODate {
  return addDays(today, -21);
}

export function makeDemo(today: ISODate = todayISO()): Household {
  const start = demoStart(today);
  const weekend = onOrAfter(addDays(today, 33), 5);
  const dentist = onOrAfter(addDays(today, 12), 2);
  const wedding = onOrAfter(addDays(today, 115), 4);
  const lisbon = onOrAfter(addDays(today, 240), 1);

  return {
    id: 'demo',
    name: "Sam's plan",
    units: 'days',
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: SAM,
        name: 'Sam',
        color: '#1D7F86',
        startDate: start,
        startBalance: 88,
        buffer: 16,
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
      { id: newId('trip'), title: 'Dentist', start: dentist, end: dentist, memberIds: [SAM], hoursPerDay: null, dayFraction: 0.5, status: 'confirmed' },
      { id: 'demo_weekend', title: 'Long weekend in Asheville', start: weekend, end: addDays(weekend, 3), memberIds: [SAM], hoursPerDay: null, status: 'confirmed' },
      { id: newId('trip'), title: "Priya's wedding", start: wedding, end: addDays(wedding, 1), memberIds: [SAM], hoursPerDay: null, status: 'confirmed' },
      { id: 'demo_lisbon', title: 'Lisbon and Porto', start: lisbon, end: addDays(lisbon, 11), memberIds: [SAM], hoursPerDay: null, status: 'tentative' },
    ],
  };
}

/** Add Jordan to the demo, joining the two big trips, to show planning together. */
export function addDemoPartner(h: Household, today: ISODate = todayISO()): Household {
  if (h.members.some((m) => m.id === JORDAN)) return h;
  const start = demoStart(today);
  const jordan: Member = {
    id: JORDAN,
    name: 'Jordan',
    color: '#7B4E9E',
    startDate: start,
    startBalance: 22,
    buffer: 8,
    holidaySet: 'common',
    holidays: [],
    checkpoints: [],
    policy: {
      method: 'biweekly',
      anchor: onOrAfter(start, 5),
      rate: 6.15,
      rateChanges: [],
      maxBalance: 200,
      carryoverCap: null,
      resetDate: null,
      allowNegative: 0,
      hoursPerDay: 8,
      workDays: [1, 2, 3, 4, 5],
    },
  };
  return {
    ...h,
    name: 'Sam & Jordan',
    members: [...h.members, jordan],
    trips: h.trips.map((t) => (t.id === 'demo_weekend' || t.id === 'demo_lisbon' ? { ...t, memberIds: [...t.memberIds, JORDAN] } : t)),
  };
}

export const DEMO_PARTNER_ID = JORDAN;
