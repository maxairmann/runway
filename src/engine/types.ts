import type { ISODate } from './dates';

export type AccrualMethod = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'annual';

export type HolidaySet = 'none' | 'common' | 'federal';

export interface RateChange {
  from: ISODate;
  /** Hours earned per accrual event from this date on. */
  rate: number;
}

export interface Policy {
  method: AccrualMethod;
  /** First accrual date (a payday for weekly/biweekly; day-of-month for monthly; grant date for annual). */
  anchor: ISODate;
  /** Hours earned per accrual event. */
  rate: number;
  rateChanges: RateChange[];
  /** Balance can't grow past this; extra accrual is lost. */
  maxBalance: number | null;
  /** On the reset date, anything above this is forfeited. */
  carryoverCap: number | null;
  /** 'MM-DD', e.g. '01-01'. */
  resetDate: string | null;
  /** Hours the employer lets you go below zero. */
  allowNegative: number;
  /** Hours charged for a full day off. */
  hoursPerDay: number;
  /** Weekdays you work, 0 = Sunday … 6 = Saturday. */
  workDays: number[];
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export interface Checkpoint {
  date: ISODate;
  /** The real balance on this date, e.g. from a paystub. */
  balance: number;
}

export interface SickPolicy {
  /** true: sick days come out of their own balance. false: they come out of PTO. */
  separate: boolean;
  /** Earned each payday (like PTO) or granted once a year. */
  method: 'payday' | 'annual';
  /** Hours added each payday, or granted each year. */
  rate: number;
  /** 'MM-DD' the yearly grant lands. */
  grantDate: string;
  /** Unused hours are lost when the next yearly grant lands. */
  resetsYearly: boolean;
  /** Earning stops at this balance. */
  maxBalance: number | null;
  /** The known sick balance at the end of this date. */
  asOf: ISODate;
  balance: number;
}

/** Personal days: a set number each year, use them or lose them. */
export interface PersonalPolicy {
  daysPerYear: number;
  /** 'MM-DD' the new year's days arrive (unused ones are lost then). */
  resetDate: string;
  /** Hours left at the end of asOf. */
  asOf: ISODate;
  balance: number;
}

/** What a day off comes out of. */
export type DayKind = 'pto' | 'sick' | 'personal';

export interface Member {
  id: string;
  name: string;
  color: string;
  /** Balance at the end of startDate. */
  startDate: ISODate;
  startBalance: number;
  /** Warn when a plan would drop below this many hours. */
  buffer: number;
  policy: Policy;
  /** Older plans: which preset counted as paid. Newer plans use paidHolidays. */
  holidaySet: HolidaySet;
  /** Your own extra paid days off (company-specific). */
  holidays: Holiday[];
  /** Older plans: label US holidays (default on). Newer plans use shownHolidays. */
  usHolidays?: boolean;
  /** Older plans: label Jewish holidays. Newer plans use shownHolidays. */
  jewishHolidays?: boolean;
  /** Holidays labeled on the calendar (names). Paid holidays are always shown. */
  shownHolidays?: string[];
  /** Holidays your employer gives off (names, e.g. "Thanksgiving"). Everything else is only a label. */
  paidHolidays?: string[];
  checkpoints: Checkpoint[];
  /** How sick time works. Missing = sick days come out of PTO. */
  sick?: SickPolicy;
  /** Personal days, if your employer gives them. */
  personal?: PersonalPolicy;
}

export type TripStatus = 'tentative' | 'confirmed';

export interface Trip {
  id: string;
  title: string;
  start: ISODate;
  end: ISODate;
  memberIds: string[];
  /** Hours charged per workday; null = a share of each person's full day (see dayFraction). */
  hoursPerDay: number | null;
  /** Share of a full day charged per workday when hoursPerDay is null: 1 = full day, 0.5 = half day. */
  dayFraction?: number;
  /** Days inside the trip that are only half days off. */
  halfDays?: ISODate[];
  /** Days inside the trip with a custom number of hours off (neither full nor half). */
  dayHours?: Record<ISODate, number>;
  status: TripStatus;
  /** Older plans: sick time rather than planned time off. Newer plans use kind. */
  sick?: boolean;
  /** Sick or personal time; planned PTO when missing. */
  kind?: Exclude<DayKind, 'pto'>;
}

export function tripKind(t: Trip): DayKind {
  return t.kind ?? (t.sick ? 'sick' : 'pto');
}

export type Units = 'days' | 'hours';

export interface Household {
  id: string;
  name: string;
  members: Member[];
  trips: Trip[];
  /** How balances and costs are shown. Defaults to days. */
  units?: Units;
  updatedAt: string;
}
