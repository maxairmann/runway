import { useMemo, useState } from 'react';
import { addDays, formatDate, formatRange, type ISODate } from '../engine/dates';
import { findEarliest } from '../engine/forecast';
import type { Household } from '../engine/types';
import { joinNames } from '../format';
import { TripCard } from './TripCard';
import { NumberInput, PersonChip } from './ui';

export function TripsView({
  household,
  today,
  onOpenTrip,
  onPlanTrip,
}: {
  household: Household;
  today: ISODate;
  onOpenTrip: (id: string) => void;
  onPlanTrip: (prefill?: { start: ISODate; end: ISODate; memberIds: string[] }) => void;
}) {
  const sorted = [...household.trips].sort((a, b) => (a.start < b.start ? -1 : 1));
  const upcoming = sorted.filter((t) => t.end >= today);
  const past = sorted.filter((t) => t.end < today).reverse();

  return (
    <div className="trips">
      <div className="section-head">
        <h1>Trips</h1>
        <button type="button" className="primary" onClick={() => onPlanTrip()}>
          Plan a trip
        </button>
      </div>

      <EarliestFinder household={household} today={today} onUse={onPlanTrip} />

      <section>
        <h2>Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="empty-line">Nothing planned. Use “Plan a trip” or find the earliest dates above.</p>
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
  onUse: (prefill: { start: ISODate; end: ISODate; memberIds: string[] }) => void;
}) {
  const [workdays, setWorkdays] = useState<number | null>(5);
  const [who, setWho] = useState<string[]>(household.members.map((m) => m.id));
  const until = addDays(today, 730);

  const result = useMemo(
    () => (workdays && workdays > 0 && who.length > 0 ? findEarliest(household, { memberIds: who, workdays, from: today, until }) : null),
    [household, who, workdays, today, until],
  );
  const names = joinNames(household.members.filter((m) => who.includes(m.id)).map((m) => m.name));

  return (
    <section className="finder" aria-live="polite">
      <h2>{household.members.length === 1 ? 'When can I go?' : "When's the earliest we can go?"}</h2>
      <div className="finder-row">
        <label className="inline-num">
          <NumberInput value={workdays} step={1} min={1} allowEmpty onChange={(v) => setWorkdays(v === null ? null : Math.round(v))} />
          <span>{household.members.length === 1 ? 'workdays off, starting as soon as possible' : 'workdays off for'}</span>
        </label>
        <div className="chips" hidden={household.members.length === 1}>
          {household.members.map((m) => (
            <PersonChip
              key={m.id}
              name={m.name}
              color={m.color}
              on={who.includes(m.id)}
              onToggle={() => setWho(who.includes(m.id) ? who.filter((x) => x !== m.id) : [...who, m.id])}
            />
          ))}
        </div>
      </div>
      {result === null ? (
        <p className="hint">Choose how many workdays and who's going.</p>
      ) : result.ok ? (
        <div className="finder-result">
          <p>
            <strong>{formatRange(result.start, result.end)}</strong> is the first stretch where{' '}
            {household.members.length === 1 ? 'you stay above your cushion' : `${names} ${who.length === 1 ? 'stays' : 'stay'} above ${who.length === 1 ? 'the' : 'their'} cushion`}, counting every trip already planned.
          </p>
          <button type="button" onClick={() => onUse({ start: result.start, end: result.end, memberIds: who })}>
            Plan these dates
          </button>
        </div>
      ) : result.reason === 'already-below' ? (
        <p className="warn-line">
          {(() => {
            const m = household.members.find((x) => x.id === result.memberId);
            const solo = household.members.length === 1;
            return `${solo ? 'You' : m?.name} already ${m && m.buffer > 0 ? (solo ? 'dip under your cushion' : 'dips under their cushion') : solo ? 'go below zero' : 'goes below zero'} on ${formatDate(result.date, 'medium')} with the trips planned now. Move or shorten one of those first.`;
          })()}
        </p>
      ) : (
        <p className="warn-line">No dates in the next two years work{household.members.length === 1 ? '' : ` for ${names}`}. Try fewer days.</p>
      )}
    </section>
  );
}
