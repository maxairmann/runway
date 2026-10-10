import { useState } from 'react';
import { formatDate, todayISO, type ISODate } from '../engine/dates';
import { HOLIDAY_SET_LABELS, presetHolidays } from '../engine/holidays';
import type { AccrualMethod, HolidaySet, Household, Member } from '../engine/types';
import { blankMemberInput, EVENTS_PER_YEAR, METHOD_LABELS, newMember } from '../data/defaults';
import { PERSON_COLORS } from '../data/ids';
import { days, hours, round2 } from '../format';
import { Field, NumberInput, Sheet } from './ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function PeopleView({
  household,
  update,
  initialEditing = null,
}: {
  household: Household;
  update: (fn: (h: Household) => Household) => void;
  initialEditing?: string | null;
}) {
  const [editing, setEditing] = useState<string | null>(initialEditing);
  // A person added a moment ago is discarded if their editor is cancelled.
  const [fresh, setFresh] = useState<string | null>(initialEditing);
  const solo = household.members.length === 1;
  const member = household.members.find((m) => m.id === editing);

  const save = (m: Member) => update((h) => ({ ...h, members: h.members.map((x) => (x.id === m.id ? m : x)) }));

  const add = () => {
    const m = newMember({ ...blankMemberInput(), name: '' }, household.members.length);
    update((h) => ({ ...h, members: [...h.members, m] }));
    setEditing(m.id);
    setFresh(m.id);
  };

  const remove = (id: string) => {
    update((h) => ({
      ...h,
      members: h.members.filter((m) => m.id !== id),
      trips: h.trips.map((t) => ({ ...t, memberIds: t.memberIds.filter((x) => x !== id) })),
    }));
    setEditing(null);
  };

  return (
    <div className="people">
      <div className="section-head">
        <h1>{solo ? 'Your PTO rules' : 'People and rules'}</h1>
        {household.members.length < 4 ? (
          <button type="button" onClick={add}>
            {solo ? 'Add a partner' : 'Add a person'}
          </button>
        ) : null}
      </div>
      <p className="hint">
        {solo
          ? 'Match these to what HR or your paystub says. Add a partner to plan time off together.'
          : 'Each person gets their own employer rules. Match them to what HR or each paystub says.'}
      </p>

      <div className="person-cards">
        {household.members.map((m) => (
          <button key={m.id} type="button" className="person-card" style={{ ['--person' as string]: m.color }} onClick={() => setEditing(m.id)}>
            <span className="person-name">
              <span className="dot" aria-hidden="true" />
              {m.name}
            </span>
            <span>
              Earns {hours(m.policy.rate)} {METHOD_LABELS[m.policy.method].toLowerCase()}, about {hours(round2(m.policy.rate * EVENTS_PER_YEAR[m.policy.method]))} a year
            </span>
            <span className="quiet">
              {[
                m.policy.maxBalance !== null ? `Max balance ${hours(m.policy.maxBalance)}` : null,
                m.policy.carryoverCap !== null ? `Carries over up to ${hours(m.policy.carryoverCap)}` : null,
                m.buffer > 0 ? `Cushion ${hours(m.buffer)}` : null,
              ]
                .filter(Boolean)
                .join(', ') || 'No caps or cushion set'}
            </span>
            <span className="edit-cue">Edit</span>
          </button>
        ))}
      </div>

      {member ? (
        <MemberEditor
          key={member.id}
          member={member}
          canRemove={household.members.length > 1}
          isPartner={household.members[0]?.id !== member.id}
          onSave={(m) => {
            save(m);
            setEditing(null);
            setFresh(null);
          }}
          onRemove={() => remove(member.id)}
          onClose={() => {
            if (fresh === member.id) remove(member.id);
            setFresh(null);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function anchorLabel(method: AccrualMethod): string {
  switch (method) {
    case 'weekly':
    case 'biweekly':
      return 'A payday when you earn PTO';
    case 'monthly':
      return 'A date you earn PTO (the day of the month repeats)';
    case 'annual':
      return 'The date the yearly grant lands';
    case 'semimonthly':
      return 'Start counting from';
  }
}

function MemberEditor({
  member,
  isPartner,
  canRemove,
  onSave,
  onRemove,
  onClose,
}: {
  member: Member;
  isPartner: boolean;
  canRemove: boolean;
  onSave: (m: Member) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [m, setM] = useState<Member>(member);
  const [cpDate, setCpDate] = useState<ISODate>(todayISO());
  const [cpBalance, setCpBalance] = useState<number | null>(null);
  const [holidayDate, setHolidayDate] = useState<ISODate>('');
  const [holidayName, setHolidayName] = useState('');
  const [rateFrom, setRateFrom] = useState<ISODate>('');
  const [rateValue, setRateValue] = useState<number | null>(null);

  const p = m.policy;
  const setP = (patch: Partial<Member['policy']>) => setM((x) => ({ ...x, policy: { ...x.policy, ...patch } }));
  const yearly = round2(p.rate * EVENTS_PER_YEAR[p.method]);
  const [resetMonth, resetDay] = (p.resetDate ?? '01-01').split('-').map(Number);
  const year = new Date().getFullYear();
  const presets = presetHolidays(m.holidaySet, year, year);

  return (
    <Sheet
      open
      title={member.name ? `Edit ${member.name}` : isPartner ? 'Add a partner' : 'Your PTO rules'}
      onClose={onClose}
      footer={
        <>
          {canRemove ? (
            <button type="button" className="danger" onClick={onRemove}>
              Remove
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => onSave({ ...m, name: m.name.trim() || (isPartner ? 'Partner' : 'Me') })}>
            Save
          </button>
        </>
      }
    >
      <fieldset>
        <legend>Who</legend>
        <Field label="Name">{(id) => <input id={id} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />}</Field>
        <div className="field">
          <span className="label">Color</span>
          <div className="swatches">
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch-btn ${m.color === c ? 'on' : ''}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                aria-pressed={m.color === c}
                onClick={() => setM({ ...m, color: c })}
              />
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Balance</legend>
        <div className="row">
          <Field label="Balance on">
            {(id) => <input id={id} type="date" value={m.startDate} onChange={(e) => e.target.value && setM({ ...m, startDate: e.target.value })} />}
          </Field>
          <Field label="Hours">
            {(id) => <NumberInput id={id} value={m.startBalance} suffix="h" onChange={(v) => setM({ ...m, startBalance: v ?? 0 })} />}
          </Field>
        </div>
        <p className="hint">Use any date your balance is known, like your last paystub. The forecast runs forward from it.</p>

        <div className="subhead">Corrections from a paystub</div>
        {m.checkpoints.length > 0 ? (
          <ul className="plain-list">
            {[...m.checkpoints]
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((c) => (
                <li key={c.date}>
                  {formatDate(c.date, 'medium')}: {hours(c.balance)}
                  <button type="button" className="link" onClick={() => setM({ ...m, checkpoints: m.checkpoints.filter((x) => x.date !== c.date) })}>
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
        <div className="row end">
          <Field label="Date">{(id) => <input id={id} type="date" value={cpDate} onChange={(e) => setCpDate(e.target.value)} />}</Field>
          <Field label="Real balance">
            {(id) => <NumberInput id={id} value={cpBalance} allowEmpty suffix="h" onChange={setCpBalance} />}
          </Field>
          <button
            type="button"
            disabled={cpBalance === null || !cpDate || cpDate < m.startDate}
            onClick={() => {
              if (cpBalance === null) return;
              setM({ ...m, checkpoints: [...m.checkpoints.filter((c) => c.date !== cpDate), { date: cpDate, balance: cpBalance }] });
              setCpBalance(null);
            }}
          >
            Add correction
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>How PTO is earned</legend>
        <Field label="How often">
          {(id) => (
            <select id={id} value={p.method} onChange={(e) => setP({ method: e.target.value as AccrualMethod })}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="row">
          <Field label={p.method === 'annual' ? 'Hours granted' : 'Hours each time'} hint={`About ${hours(yearly)} (${days(yearly, p.hoursPerDay)}) a year`}>
            {(id) => <NumberInput id={id} value={p.rate} suffix="h" onChange={(v) => setP({ rate: v ?? 0 })} />}
          </Field>
          <Field label={anchorLabel(p.method)}>
            {(id) => <input id={id} type="date" value={p.anchor} onChange={(e) => e.target.value && setP({ anchor: e.target.value })} />}
          </Field>
        </div>

        <div className="subhead">Rate changes</div>
        {p.rateChanges.length > 0 ? (
          <ul className="plain-list">
            {p.rateChanges.map((rc) => (
              <li key={rc.from}>
                From {formatDate(rc.from, 'medium')}: {hours(rc.rate)} each time
                <button type="button" className="link" onClick={() => setP({ rateChanges: p.rateChanges.filter((x) => x.from !== rc.from) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Add one if your rate goes up on a work anniversary.</p>
        )}
        <div className="row end">
          <Field label="Starting">{(id) => <input id={id} type="date" value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} />}</Field>
          <Field label="New hours each time">
            {(id) => <NumberInput id={id} value={rateValue} allowEmpty suffix="h" onChange={setRateValue} />}
          </Field>
          <button
            type="button"
            disabled={!rateFrom || rateValue === null}
            onClick={() => {
              if (rateValue === null) return;
              setP({ rateChanges: [...p.rateChanges.filter((x) => x.from !== rateFrom), { from: rateFrom, rate: rateValue }] });
              setRateFrom('');
              setRateValue(null);
            }}
          >
            Add rate change
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Employer rules</legend>
        <div className="row">
          <Field label="Maximum balance" hint="Earning stops at this amount. Leave empty for no cap.">
            {(id) => <NumberInput id={id} value={p.maxBalance} allowEmpty placeholder="No cap" suffix="h" onChange={(v) => setP({ maxBalance: v })} />}
          </Field>
          <Field label="Can go negative by" hint="Some employers let you borrow ahead.">
            {(id) => <NumberInput id={id} value={p.allowNegative} suffix="h" onChange={(v) => setP({ allowNegative: Math.max(0, v ?? 0) })} />}
          </Field>
        </div>
        <div className="row">
          <Field label="Carries over each year, at most" hint="Anything above this is forfeited on the reset date. Empty means it all carries over.">
            {(id) => (
              <NumberInput
                id={id}
                value={p.carryoverCap}
                allowEmpty
                placeholder="All of it"
                suffix="h"
                onChange={(v) => setP({ carryoverCap: v, resetDate: v === null ? p.resetDate : (p.resetDate ?? '01-01') })}
              />
            )}
          </Field>
          {p.carryoverCap !== null ? (
            <div className="field">
              <span className="label">Reset date</span>
              <div className="row tight">
                <select
                  aria-label="Reset month"
                  value={resetMonth}
                  onChange={(e) => setP({ resetDate: `${String(e.target.value).padStart(2, '0')}-${String(resetDay).padStart(2, '0')}` })}
                >
                  {MONTHS.map((mo, i) => (
                    <option key={mo} value={i + 1}>
                      {mo}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Reset day"
                  value={resetDay}
                  onChange={(e) => setP({ resetDate: `${String(resetMonth).padStart(2, '0')}-${String(e.target.value).padStart(2, '0')}` })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </fieldset>

      <fieldset>
        <legend>Planning</legend>
        <div className="row">
          <Field label="Cushion" hint="Warn me when a plan drops below this. Handy for sick days.">
            {(id) => <NumberInput id={id} value={m.buffer} suffix="h" onChange={(v) => setM({ ...m, buffer: Math.max(0, v ?? 0) })} />}
          </Field>
          <Field label="A full day off is">
            {(id) => <NumberInput id={id} value={p.hoursPerDay} step={0.5} suffix="h" onChange={(v) => setP({ hoursPerDay: v && v > 0 ? v : 8 })} />}
          </Field>
        </div>
        <div className="field">
          <span className="label">Workdays</span>
          <div className="chips">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`chip small ${p.workDays.includes(i) ? 'on' : ''}`}
                aria-pressed={p.workDays.includes(i)}
                onClick={() =>
                  setP({ workDays: p.workDays.includes(i) ? p.workDays.filter((x) => x !== i) : [...p.workDays, i].sort() })
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <Field label="Paid holidays" hint={presets.length > 0 ? `${year}: ${presets.map((h) => h.name).join(', ')}.` : undefined}>
          {(id) => (
            <select id={id} value={m.holidaySet} onChange={(e) => setM({ ...m, holidaySet: e.target.value as HolidaySet })}>
              {Object.entries(HOLIDAY_SET_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="subhead">Extra company holidays</div>
        {m.holidays.length > 0 ? (
          <ul className="plain-list">
            {m.holidays.map((h) => (
              <li key={h.date + h.name}>
                {formatDate(h.date, 'medium')}: {h.name}
                <button type="button" className="link" onClick={() => setM({ ...m, holidays: m.holidays.filter((x) => x !== h) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="row end">
          <Field label="Date">{(id) => <input id={id} type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />}</Field>
          <Field label="Name">{(id) => <input id={id} value={holidayName} placeholder="Company day off" onChange={(e) => setHolidayName(e.target.value)} />}</Field>
          <button
            type="button"
            disabled={!holidayDate}
            onClick={() => {
              setM({ ...m, holidays: [...m.holidays, { date: holidayDate, name: holidayName.trim() || 'Company holiday' }] });
              setHolidayDate('');
              setHolidayName('');
            }}
          >
            Add holiday
          </button>
        </div>
      </fieldset>
    </Sheet>
  );
}
