import { formatRange, toDay } from '../engine/dates';
import { tripCost } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { amount } from '../format';

/** A trip as a boarding-pass stub: the details on the left, what it costs on the tear-off. */
export function TripCard({ trip, household, onOpen }: { trip: Trip; household: Household; onOpen?: () => void }) {
  const units = household.units ?? 'days';
  const me = household.members[0];
  const span = toDay(trip.end) - toDay(trip.start) + 1;
  const halves = trip.halfDays?.length ?? 0;
  const part =
    trip.hoursPerDay !== null
      ? `${trip.hoursPerDay} h a day`
      : trip.dayFraction === 0.5
        ? 'Half days'
        : halves > 0
          ? `${halves === 1 ? 'a half day' : `${halves} half days`}`
          : null;
  return (
    <button type="button" className="pass solo" onClick={onOpen}>
      <span className="pass-main">
        <span className="pass-title">{trip.title || 'Untitled trip'}</span>
        <span className="pass-dates">{formatRange(trip.start, trip.end)}</span>
        <span className="pass-meta">
          {span === 1 ? '1 calendar day' : `${span} calendar days`}
          {part ? `, ${part.toLowerCase()}` : ''}
        </span>
      </span>
      <span className="pass-stub">
        <span className="pass-cost big">{amount(tripCost(me, trip), me.policy.hoursPerDay, units)}</span>
      </span>
    </button>
  );
}
