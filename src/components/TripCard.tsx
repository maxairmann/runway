import { formatRange, toDay } from '../engine/dates';
import { tripCost } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { hours } from '../format';

/** A trip as a boarding-pass stub: the details on the left, what it costs each person on the tear-off. */
export function TripCard({ trip, household, onOpen }: { trip: Trip; household: Household; onOpen?: () => void }) {
  const going = household.members.filter((m) => trip.memberIds.includes(m.id));
  const nights = toDay(trip.end) - toDay(trip.start) + 1;
  return (
    <button type="button" className={`pass ${trip.status}`} onClick={onOpen}>
      <span className="pass-main">
        <span className="pass-title">{trip.title || 'Untitled trip'}</span>
        <span className="pass-dates">{formatRange(trip.start, trip.end)}</span>
        <span className="pass-meta">
          {nights === 1 ? '1 day' : `${nights} days`}
          {trip.status === 'tentative' ? <span className="tag">Tentative</span> : null}
        </span>
      </span>
      <span className="pass-stub">
        {going.map((m) => (
          <span key={m.id} className="pass-person" style={{ ['--person' as string]: m.color }}>
            <span className="dot" aria-hidden="true" />
            <span className="pass-name">{m.name}</span>
            <span className="pass-cost">{hours(tripCost(m, trip))}</span>
          </span>
        ))}
        {going.length === 0 ? <span className="pass-name">No one yet</span> : null}
      </span>
    </button>
  );
}
