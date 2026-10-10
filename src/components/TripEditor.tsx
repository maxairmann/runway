import { useMemo, useState } from 'react';
import { addDays, formatDate, formatRange, toDay, weekdayOf, type ISODate } from '../engine/dates';
import { findEarliest, tripImpact } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { amount, sizeAdjective } from '../format';
import { BalanceChart } from './BalanceChart';
import { Field, NumberInput, PersonChip, Segmented, Sheet } from './ui';

type DayKind = 'full' | 'half' | 'hours';

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
  const units = household.units ?? 'days';
  const solo = household.members.length === 1;
  const [draft, setDraft] = useState<Trip>(trip);
  const set = (patch: Partial<Trip>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.memberIds.length > 0 && draft.end >= draft.start;
  const dayKind: DayKind = draft.hoursPerDay !== null ? 'hours' : draft.dayFraction === 0.5 ? 'half' : 'full';

  const until = useMemo(() => {
    const a = addDays(today, 540);
    const b = addDays(draft.end, 365);
    return a > b ? a : b;
  }, [today, draft.end]);

  const impact = useMemo(
    () => (valid ? tripImpact(household, draft, { from: today, until }) : []),
    [household, draft, today, until, valid],
  );
  const problem = impact.some((i) => i.breaksBuffer || i.overdraws);

  // When the trip doesn't fit, look for the first dates of the same length that do.
  const suggestion = useMemo(() => {
    if (!problem) return null;
    let workdays = 0;
    for (let n = toDay(draft.start); n <= toDay(draft.end); n++) {
      const wd = weekdayOf(n);
      if (wd !== 0 && wd !== 6) workdays++;
    }
    if (workdays === 0) return null;
    const others = { ...household, trips: household.trips.filter((t) => t.id !== draft.id) };
    const r = findEarliest(others, { memberIds: draft.memberIds, workdays, from: today, until, hoursPerDay: draft.hoursPerDay });
    return r.ok ? r : null;
  }, [problem, household, draft, today, until]);

  const ghost = Object.fromEntries(impact.map((i) => [i.memberId, i.before]));
  const after = Object.fromEntries(
    household.members.map((m) => {
      const hit = impact.find((i) => i.memberId === m.id);
      return [m.id, hit ? hit.after : impact[0]?.before];
    }),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Plan a trip' : 'Edit trip'}
      footer={
        <>
          {!isNew ? (
            <button type="button" className="danger" onClick={() => onDelete(draft.id)}>
              Delete trip
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={() => onSave({ ...draft, title: draft.title.trim() || 'Time off' })}>
            {isNew ? 'Add trip' : 'Save trip'}
          </button>
        </>
      }
    >
      <Field label="What is it?">
        {(id) => (
          <input id={id} value={draft.title} placeholder="Beach week, wedding, dentist…" onChange={(e) => set({ title: e.target.value })} />
        )}
      </Field>

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

      {!solo ? (
        <div className="field">
          <span className="label">Who's taking it</span>
          <div className="chips">
            {household.members.map((m) => (
              <PersonChip
                key={m.id}
                name={m.name}
                color={m.color}
                on={draft.memberIds.includes(m.id)}
                onToggle={() =>
                  set({
                    memberIds: draft.memberIds.includes(m.id) ? draft.memberIds.filter((x) => x !== m.id) : [...draft.memberIds, m.id],
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="row">
        <div className="field">
          <span className="label">Each workday</span>
          <Segmented
            label="Time off each workday"
            value={dayKind}
            onChange={(v) =>
              set(v === 'full' ? { hoursPerDay: null, dayFraction: 1 } : v === 'half' ? { hoursPerDay: null, dayFraction: 0.5 } : { hoursPerDay: 2, dayFraction: 1 })
            }
            options={[
              { value: 'full', label: 'Full day' },
              { value: 'half', label: 'Half day' },
              { value: 'hours', label: 'Hours' },
            ]}
          />
        </div>
        {dayKind === 'hours' ? (
          <Field label="Hours off each day">
            {(id) => <NumberInput id={id} value={draft.hoursPerDay} step={0.5} min={0.5} suffix="h" onChange={(v) => set({ hoursPerDay: v ?? 0 })} />}
          </Field>
        ) : null}
      </div>

      <div className="field">
        <span className="label">Status</span>
        <Segmented
          label="Trip status"
          value={draft.status}
          onChange={(status) => set({ status })}
          options={[
            { value: 'tentative', label: 'Just an idea' },
            { value: 'confirmed', label: 'Booked' },
          ]}
        />
      </div>

      {valid ? (
        <section className={`impact ${problem ? 'problem' : ''}`} aria-live="polite">
          <h3>{problem ? "This trip doesn't fit yet" : 'This trip fits'}</h3>
          <ul>
            {impact.map((i) => {
              const m = household.members.find((x) => x.id === i.memberId)!;
              const pd = m.policy.hoursPerDay;
              const left = i.after.balanceOn(draft.end);
              const newLow = i.after.low.balance < i.before.low.balance - 0.05 && Math.abs(i.after.low.balance - left) > 0.05;
              return (
                <li key={m.id} style={{ ['--person' as string]: m.color }}>
                  {solo ? <span aria-hidden="true" /> : <span className="dot" aria-hidden="true" />}
                  <span>
                    <strong>{solo ? 'You' : m.name}</strong> {solo ? 'use' : 'uses'} {amount(i.cost, pd, units)}, leaving {amount(left, pd, units)} after the trip.
                    {newLow ? ` New lowest point: ${amount(i.after.low.balance, pd, units)} on ${formatDate(i.after.low.date, 'short')}.` : ''}
                    {i.overdraws ? <em className="bad"> Runs out on {formatDate(i.after.firstOverdrawn!, 'medium')}.</em> : null}
                    {!i.overdraws && i.breaksBuffer ? (
                      <em className="warn">
                        {' '}
                        Drops under the {sizeAdjective(m.buffer, pd, units)} cushion on {formatDate(i.after.firstBelowBuffer!, 'medium')}.
                      </em>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {suggestion ? (
            <p className="suggest">
              Earliest dates of the same length that work: {formatRange(suggestion.start, suggestion.end)}.{' '}
              <button type="button" className="link" onClick={() => set({ start: suggestion.start, end: suggestion.end })}>
                Move it there
              </button>
            </p>
          ) : null}
          {impact.length > 0 ? (
            <BalanceChart
              household={household}
              forecasts={after}
              ghost={ghost}
              from={addDays(today, -7)}
              until={until}
              today={today}
              units={units}
              trips={[...household.trips.filter((t) => t.id !== draft.id), draft]}
              focusTripId={draft.id}
              height={170}
              compact
            />
          ) : null}
          <p className="hint">Dashed lines show the forecast without this trip. Weekends and holidays are free.</p>
        </section>
      ) : (
        <p className="hint">{solo ? "Make sure the last day isn't before the first." : "Pick at least one person and make sure the last day isn't before the first."}</p>
      )}
    </Sheet>
  );
}
