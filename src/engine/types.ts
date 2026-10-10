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
  holidaySet: HolidaySet;
  holidays: Holiday[];
  checkpoints: Checkpoint[];
}

export type TripStatus = 'tentative' | 'confirmed';

export interface Trip {
  id: string;
  title: string;
  start: ISODate;
  end: ISODate;
  memberIds: string[];
  /** Hours charged per workday; null = each person's full day. */
  hoursPerDay: number | null;
  status: TripStatus;
}

export interface Household {
  id: string;
  name: string;
  members: Member[];
  trips: Trip[];
  updatedAt: string;
}
