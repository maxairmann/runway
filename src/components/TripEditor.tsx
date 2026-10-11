import { useMemo, useState } from 'react';
import { addDays, formatDate, formatRange, toDay, weekdayOf, type ISODate } from '../engine/dates';
import { findEarliest, tripImpact } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { amount } from '../format';
import { Field, Segmented, Sheet } from './ui';

type DayKind = 'full' | 'half';

export function TripEditor({
  household,
  trip,
  isNew,
  today,
  onSave,
  onDelete,
  onClose,
}: {
  household: Household;
  trip: Trip;
  isNew: boolean;
  today: ISODate;
  onSave: (t: Trip) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const units = household.units ?? 'hours';
  const [draft, setDraft] = useState<Trip>(trip);
  const set = (patch: Partial<Trip>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.memberIds.length > 0 && draft.end >= draft.start;
  const dayKind: DayKind = draft.dayFraction === 0.5 ? 'half' : 'full';

  const until = useMemo(() => {
    const a = addDays(today, 540);
    const b = addDays(draft.end, 365);
    return a > b ? a : b;
  }, [today, draft.end]);

  const impact = useMemo(
    () => (valid ? tripImpact(household, draft, { from: today, until }) : []),
    [household, draft, today, until, valid],
  );
  const problem = impact.some((i) => i.overdraws);
  const halfDays = (draft.halfDays ?? []).filter((d) => d >= draft.start && d <= draft.end);

  // When the trip doesn't fit, look for the next dates of the same length that do, starting from the dates asked for.
  const suggestion = useMemo(() => {
    if (!problem) return null;
    const work = household.members[0].policy.workDays;
    let workdays = 0;
    for (let n = toDay(draft.start); n <= toDay(draft.end); n++) if (work.includes(weekdayOf(n))) workdays++;
    if (workdays === 0) return null;
    const others = { ...household, trips: household.trips.filter((t) => t.id !== draft.id) };
    const dayBefore = addDays(draft.start, -1);
    const from = dayBefore > today ? dayBefore : today;
    const r = findEarliest(others, { memberIds: draft.memberIds, workdays, from, until, hoursPerDay: draft.hoursPerDay });
    return r.ok ? r : null;
  }, [problem, household, draft, today, until]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Add time off' : 'Edit time off'}
      footer={
        <>
          {!isNew ? (
            <button type="button" className="danger" onClick={() => onDelete(draft.id)}>
              Delete
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={() => onSave({ ...draft, title: 'Time off' })}>
            {isNew ? 'Add' : 'Save'}
          </button>
        </>
      }
    >

      <div className="row">
        <Field label="First day off">
          {(id) => (
            <input
              id={id}
              type="date"
              value={draft.start}
              onChange={(e) => {
                const start = e.target.value;
                if (!start) return;
                set({ start, end: draft.end < start ? start : draft.end });
              }}
            />
          )}
        </Field>
        <Field label="Last day off">
          {(id) => <input id={id} type="date" value={draft.end} min={draft.start} onChange={(e) => e.target.value && set({ end: e.target.value })} />}
        </Field>
      </div>

      <div className="row">
        <div className="field">
          <span className="label">Each workday</span>
          <Segmented
            label="Time off each workday"
            value={dayKind}
            onChange={(v) =>
              set(
                v === 'full'
                  ? { hoursPerDay: null, dayFraction: 1, halfDays: undefined }
                  : { hoursPerDay: null, dayFraction: 0.5, halfDays: undefined },
              )
            }
            options={[
              { value: 'full', label: 'Full days' },
              { value: 'half', label: 'Half days' },
            ]}
          />
        </div>
        {halfDays.length > 0 && dayKind === 'full' ? (
          <p className="hint half-note">
            Full days, except {halfDays.length === 1 ? 'a half day on' : 'half days on'}{' '}
            {halfDays.map((d) => formatDate(d, 'short')).join(', ')}. Choosing an option above applies it to every day.
          </p>
        ) : null}
      </div>

      {valid ? (
        <section className={`impact ${problem ? 'problem' : ''}`} aria-live="polite">
          <h3>{problem ? "This doesn't fit yet" : 'This fits'}</h3>
          {impact.map((i) => {
            const pd = household.members[0].policy.hoursPerDay;
            const left = i.after.balanceOn(draft.end);
            const newLow = i.after.low.balance < i.before.low.balance - 0.05 && Math.abs(i.after.low.balance - left) > 0.05;
            return (
              <p key={i.memberId}>
                You use {amount(i.cost, pd, units)}, leaving {amount(left, pd, units)} after.
                {newLow ? ` New lowest point: ${amount(i.after.low.balance, pd, units)} on ${formatDate(i.after.low.date, 'short')}.` : ''}
                {i.overdrawnOn ? <em className="bad"> You’d be below zero on {formatDate(i.overdrawnOn, 'medium')}.</em> : null}
              </p>
            );
          })}
          {suggestion ? (
            <p className="suggest">
              {toDay(suggestion.start) - toDay(draft.start) > 31
                ? `Nothing near these dates fits with the time off planned before them. The next dates that do: ${formatRange(suggestion.start, suggestion.end)}.`
                : `Next dates of the same length that work: ${formatRange(suggestion.start, suggestion.end)}.`}{' '}
              <button type="button" className="link" onClick={() => set({ start: suggestion.start, end: suggestion.end })}>
                Move it there
              </button>
            </p>
          ) : null}
          <p className="hint">Weekends and paid holidays are free.</p>
        </section>
      ) : (
        <p className="hint">Make sure the last day isn't before the first.</p>
      )}
    </Sheet>
  );
}
