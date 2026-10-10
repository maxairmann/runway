import { formatRange, toDay } from '../engine/dates';
import { tripCost } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { amount } from '../format';

/** A trip as a boarding-pass stub: the details on the left, what it costs on the tear-off. */
export function TripCard({ trip, household, onOpen }: { trip: Trip; household: Household; onOpen?: () => void }) {
  const units = household.units ?? 'days';
  const solo = household.members.length === 1;
  const going = household.members.filter((m) => trip.memberIds.includes(m.id));
  const span = toDay(trip.end) - toDay(trip.start) + 1;
  const part = trip.hoursPerDay !== null ? `${trip.hoursPerDay} h a day` : trip.dayFraction === 0.5 ? 'Half days' : null;
  return (
    <button type="button" className={`pass ${trip.status} ${solo ? 'solo' : ''}`} onClick={onOpen}>
      <span className="pass-main">
        <span className="pass-title">{trip.title || 'Untitled trip'}</span>
        <span className="pass-dates">{formatRange(trip.start, trip.end)}</span>
        <span className="pass-meta">
          {span === 1 ? '1 calendar day' : `${span} calendar days`}
          {part ? `, ${part.toLowerCase()}` : ''}
          {trip.status === 'tentative' ? <span className="tag">Idea</span> : null}
        </span>
      </span>
      <span className="pass-stub">
        {solo ? (
          <span className="pass-cost big">{amount(tripCost(going[0] ?? household.members[0], trip), household.members[0].policy.hoursPerDay, units)}</span>
        ) : (
          going.map((m) => (
            <span key={m.id} className="pass-person" style={{ ['--person' as string]: m.color }}>
              <span className="dot" aria-hidden="true" />
              <span className="pass-name">{m.name}</span>
              <span className="pass-cost">{amount(tripCost(m, trip), m.policy.hoursPerDay, units)}</span>
            </span>
          ))
        )}
        {!solo && going.length === 0 ? <span className="pass-name">No one yet</span> : null}
      </span>
    </button>
  );
}
