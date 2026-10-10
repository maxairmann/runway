import { todayISO, type ISODate } from '../engine/dates';
import type { AccrualMethod, Household, Member } from '../engine/types';
import { newId, PERSON_COLORS } from './ids';

export const METHOD_LABELS: Record<AccrualMethod, string> = {
  weekly: 'Every week',
  biweekly: 'Every other week',
  semimonthly: 'Twice a month (15th and last day)',
  monthly: 'Once a month',
  annual: 'All at once each year',
};

/** Accrual events per year, for "about N hours a year" hints. */
export const EVENTS_PER_YEAR: Record<AccrualMethod, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
};

export interface NewMemberInput {
  name: string;
  balance: number;
  asOf: ISODate;
  method: AccrualMethod;
  rate: number;
  anchor: ISODate;
  color?: string;
}

export function newMember(input: NewMemberInput, index = 0): Member {
  return {
    id: newId('person'),
    name: input.name.trim() || `Person ${index + 1}`,
    color: input.color ?? PERSON_COLORS[index % PERSON_COLORS.length],
    startDate: input.asOf,
    startBalance: input.balance,
    buffer: 0,
    holidaySet: 'common',
    holidays: [],
    checkpoints: [],
    policy: {
      method: input.method,
      anchor: input.anchor,
      rate: input.rate,
      rateChanges: [],
      maxBalance: null,
      carryoverCap: null,
      resetDate: null,
      allowNegative: 0,
      hoursPerDay: 8,
      workDays: [1, 2, 3, 4, 5],
    },
  };
}

export function blankMemberInput(): NewMemberInput {
  const today = todayISO();
  return { name: '', balance: 0, asOf: today, method: 'biweekly', rate: 4, anchor: today };
}

export function newHousehold(members: Member[]): Household {
  const names = members.map((m) => m.name);
  return {
    id: newId('household'),
    name: names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]}'s plan`,
    members,
    trips: [],
    units: 'days',
    updatedAt: new Date().toISOString(),
  };
}
