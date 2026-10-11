import { useMemo, useState } from 'react';
import { addDays, formatRange, isoOf, partsOf, toDay, type ISODate } from '../engine/dates';
import { findEarliest } from '../engine/forecast';
import type { Household } from '../engine/types';
import { TripCard } from './TripCard';

export function TripsView({
  household,
  today,
  onOpenTrip,
  onPlanTrip,
}: {
  household: Household;
  today: ISODate;
  onOpenTrip: (id: string) => void;
  onPlanTrip: (prefill?: { start: ISODate; end: ISODate }) => void;
}) {
  const sorted = [...household.trips].sort((a, b) => (a.start < b.start ? -1 : 1));
  const upcoming = sorted.filter((t) => t.end >= today);
  const past = sorted.filter((t) => t.end < today).reverse();

  return (
    <div className="trips">
      <div className="section-head">
        <h1>All time off</h1>
        <button type="button" className="primary" onClick={() => onPlanTrip()}>
          Add time off
        </button>
      </div>

      <EarliestFinder household={household} today={today} onUse={onPlanTrip} />

      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="empty-line">Nothing planned. Tap days on the Plan calendar, or find the earliest dates above.</p>
        ) : (
          <div className="passes">
            {upcoming.map((t) => (
              <TripCard key={t.id} trip={t} household={household} onOpen={() => onOpenTrip(t.id)} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="past">
          <h2>Past</h2>
          <div className="passes">
            {past.map((t) => (
              <TripCard key={t.id} trip={t} household={household} onOpen={() => onOpenTrip(t.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EarliestFinder({
  household,
  today,
  onUse,
}: {
  household: Household;
  today: ISODate;
  onUse: (prefill: { start: ISODate; end: ISODate }) => void;
}) {
  const [workdays, setWorkdays] = useState<number | null>(5);
  /** '' = as soon as possible, otherwise the first of a month ('YYYY-MM-01'). */
  const [after, setAfter] = useState<ISODate | ''>('');
  const me = household.members[0];
  const until = addDays(today, 730);
  const t = partsOf(toDay(today));
  const months = Array.from({ length: 24 }, (_, i) => {
    const idx = t.y * 12 + (t.m - 1) + i + 1;
    return isoOf(Math.floor(idx / 12), (idx % 12) + 1, 1);
  });
  const from = after && addDays(after, -1) > today ? addDays(after, -1) : today;

  const result = useMemo(
    () => (workdays && workdays > 0 ? findEarliest(household, { memberIds: [me.id], workdays, from, until }) : null),
    [household, me.id, workdays, from, until],
  );

  return (
    <section className="finder" aria-live="polite">
      <h2>When can I go?</h2>
      <div className="finder-row">
        <label className="inline-num">
          <input
            id="finder-days"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={workdays ?? ''}
            onChange={(e) => setWorkdays(e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))))}
          />
          <span>workdays off,</span>
        </label>
        <label className="finder-when">
          <span className="visually-hidden">Starting</span>
          <select id="finder-after" value={after} onChange={(e) => setAfter(e.target.value as ISODate | '')}>
            <option value="">as soon as possible</option>
            {months.map((m) => (
              <option key={m} value={m}>
                in {new Date(`${m}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} or later
              </option>
            ))}
          </select>
        </label>
      </div>
      {result === null ? (
        <p className="hint">Enter how many workdays you want off.</p>
      ) : result.ok ? (
        <div className="finder-result">
          <p>
            <strong>{formatRange(result.start, result.end)}</strong> is the first stretch{after ? ' from then' : ''} you can take without
            going below zero, counting the time off already planned.
          </p>
          <button type="button" onClick={() => onUse({ start: result.start, end: result.end })}>
            Plan these dates
          </button>
        </div>
      ) : (
        <p className="warn-line">No dates in the next two years work. Try fewer days.</p>
      )}
    </section>
  );
}
