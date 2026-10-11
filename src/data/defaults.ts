import { todayISO, type ISODate } from '../engine/dates';
import type { AccrualMethod, Household, Member } from '../engine/types';
import { newId, PERSON_COLORS } from './ids';

export const METHOD_LABELS: Record<AccrualMethod, string> = {
  biweekly: 'Every 2 weeks',
  weekly: 'Every week',
  semimonthly: 'Twice a month (15th and last day)',
  monthly: 'Once a month',
  annual: 'Once a year (PTO granted up front)',
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
  balance: number | null;
  asOf: ISODate;
  method: AccrualMethod;
  rate: number | null;
  /** A real payday (or grant date); empty until the user picks one. */
  anchor: ISODate | '';
  color?: string;
}

export function newMember(input: NewMemberInput, index = 0): Member {
  return {
    id: newId('person'),
    name: input.name.trim() || `Person ${index + 1}`,
    color: input.color ?? PERSON_COLORS[index % PERSON_COLORS.length],
    startDate: input.asOf,
    startBalance: input.balance ?? 0,
    buffer: 0,
    holidaySet: 'common',
    holidays: [],
    checkpoints: [],
    policy: {
      method: input.method,
      anchor: input.anchor || input.asOf,
      rate: input.rate ?? 0,
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
  return { name: '', balance: null, asOf: today, method: 'biweekly', rate: null, anchor: '' };
}

export function newHousehold(members: Member[]): Household {
  return {
    id: newId('household'),
    name: `${members[0].name}'s plan`,
    members,
    trips: [],
    units: 'hours',
    updatedAt: new Date().toISOString(),
  };
}
