import { useState } from 'react';
import { formatDate, todayISO, type ISODate } from '../engine/dates';
import { holidayChoices, paidNames, shownNames } from '../engine/holidays';
import type { AccrualMethod, Household, Member, SickPolicy } from '../engine/types';
import { EVENTS_PER_YEAR, METHOD_LABELS } from '../data/defaults';
import { hours, round2 } from '../format';
import { Field, NumberInput, Segmented } from './ui';

type HolidayState = 'hidden' | 'shown' | 'paid';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function anchorLabel(method: AccrualMethod): string {
  switch (method) {
    case 'weekly':
    case 'biweekly':
      return 'A recent payday';
    case 'monthly':
      return 'A date you earn PTO (the day of the month repeats)';
    case 'annual':
      return 'The date the yearly grant lands';
    case 'semimonthly':
      return 'Start counting from';
  }
}

/** Payday and PTO rules, shown at the top of Settings. Changes save as you make them. */
export function PtoRules({
  household,
  update,
}: {
  household: Household;
  update: (fn: (h: Household) => Household) => void;
}) {
  const m = household.members[0];
  const setM = (next: Member) => update((h) => ({ ...h, members: [next, ...h.members.slice(1)] }));
  const [cpDate, setCpDate] = useState<ISODate>(todayISO());
  const [cpBalance, setCpBalance] = useState<number | null>(null);
  const [holidayDate, setHolidayDate] = useState<ISODate>('');
  const [holidayName, setHolidayName] = useState('');
  const [rateFrom, setRateFrom] = useState<ISODate>('');
  const [rateValue, setRateValue] = useState<number | null>(null);

  const p = m.policy;
  const setP = (patch: Partial<Member['policy']>) => setM({ ...m, policy: { ...m.policy, ...patch } });
  const yearly = round2(p.rate * EVENTS_PER_YEAR[p.method]);
  const [resetMonth, resetDay] = (p.resetDate ?? '01-01').split('-').map(Number);
  const sick: SickPolicy = m.sick ?? {
    separate: false,
    method: 'payday',
    rate: 0,
    grantDate: '01-01',
    resetsYearly: false,
    maxBalance: null,
    asOf: todayISO(),
    balance: 0,
  };
  const setSick = (patch: Partial<SickPolicy>) => setM({ ...m, sick: { ...sick, ...patch } });
  const [grantMonth, grantDay] = sick.grantDate.split('-').map(Number);
  const paid = paidNames(m);
  const shown = shownNames(m);
  const choices = holidayChoices(todayISO());
  const [allHolidays, setAllHolidays] = useState(false);
  const holidayState = (n: string): HolidayState => (paid.has(n) ? 'paid' : shown.has(n) ? 'shown' : 'hidden');
  const setHoliday = (n: string, state: HolidayState) => {
    const nextShown = new Set(shown);
    const nextPaid = new Set(paid);
    nextShown.delete(n);
    nextPaid.delete(n);
    if (state !== 'hidden') nextShown.add(n);
    if (state === 'paid') nextPaid.add(n);
    setM({ ...m, shownHolidays: [...nextShown], paidHolidays: [...nextPaid] });
  };
  const listed = allHolidays ? choices : choices.filter((c) => shown.has(c.name));
  const hiddenCount = choices.length - choices.filter((c) => shown.has(c.name)).length;

  const personal = m.personal ?? { daysPerYear: 0, resetDate: '01-01', asOf: todayISO(), balance: 0 };
  const setPersonal = (patch: Partial<typeof personal>) => setM({ ...m, personal: { ...personal, ...patch } });
  const [personalMonth, personalDay] = personal.resetDate.split('-').map(Number);

  return (
    <>

      <section>
        <h2>Payday</h2>
        <p className="hint">PTO is added each payday. Your balance on paydays shows on the Plan calendar.</p>
        <div className="row">
            <Field label={anchorLabel(p.method)}>
            {(id) => <input id={id} type="date" value={p.anchor} onChange={(e) => e.target.value && setP({ anchor: e.target.value })} />}
          </Field>
        </div>
        <Field label="How often you’re paid">
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
          <Field label={p.method === 'annual' ? 'PTO granted each year' : 'PTO added each payday'} hint={`About ${hours(yearly)} a year`}>
            {(id) => <NumberInput id={id} value={p.rate} suffix="h" onChange={(v) => setP({ rate: v ?? 0 })} />}
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
      </section>
      <section>
        <h2>Balance</h2>
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
      </section>


      <section>
        <h2>Employer rules</h2>
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
      </section>

      <section>
        <h2>Sick time</h2>
        <Segmented
          label="Sick days"
          value={sick.separate ? 'separate' : 'pto'}
          options={[
            { value: 'pto', label: 'Comes out of PTO' },
            { value: 'separate', label: 'Separate balance' },
          ]}
          onChange={(v) => setSick({ separate: v === 'separate' })}
        />
        <p className="hint">
          To mark a sick day, press and hold a day on the calendar (or right-click it) and choose Sick.
          {sick.separate ? '' : ' It uses PTO like any other day off.'}
        </p>
        {sick.separate ? (
          <>
            <div className="row">
              <Field label="Sick time you have">
                {(id) => <NumberInput id={id} value={sick.balance} suffix="h" onChange={(v) => setSick({ balance: v ?? 0, asOf: todayISO() })} />}
              </Field>
              <Field label="You get it">
                {(id) => (
                  <select id={id} value={sick.method} onChange={(e) => setSick({ method: e.target.value as SickPolicy['method'] })}>
                    <option value="payday">Each payday</option>
                    <option value="annual">Once a year</option>
                  </select>
                )}
              </Field>
            </div>
            <p className="hint">Balance as of {formatDate(sick.asOf, 'medium')}. Update it any time from a paystub.</p>
            <div className="row">
              <Field label={sick.method === 'annual' ? 'Hours each year' : 'Hours each payday'}>
                {(id) => <NumberInput id={id} value={sick.rate} step={0.01} suffix="h" onChange={(v) => setSick({ rate: Math.max(0, v ?? 0) })} />}
              </Field>
              <Field label="Maximum balance" hint="Leave empty for no cap.">
                {(id) => <NumberInput id={id} value={sick.maxBalance} allowEmpty placeholder="No cap" suffix="h" onChange={(v) => setSick({ maxBalance: v })} />}
              </Field>
            </div>
            {sick.method === 'annual' ? (
              <>
                <div className="field">
                  <span className="label">New hours arrive on</span>
                  <div className="row tight">
                    <select
                      aria-label="Grant month"
                      value={grantMonth}
                      onChange={(e) => setSick({ grantDate: `${String(e.target.value).padStart(2, '0')}-${String(grantDay).padStart(2, '0')}` })}
                    >
                      {MONTHS.map((mo, i) => (
                        <option key={mo} value={i + 1}>
                          {mo}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Grant day"
                      value={grantDay}
                      onChange={(e) => setSick({ grantDate: `${String(grantMonth).padStart(2, '0')}-${String(e.target.value).padStart(2, '0')}` })}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="check">
                  <input type="checkbox" checked={sick.resetsYearly} onChange={(e) => setSick({ resetsYearly: e.target.checked })} />
                  Unused sick time is lost when the new hours arrive
                </label>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      <section>
        <h2>Personal days</h2>
        <div className="row">
          <Field label="Personal days each year" hint="Leave at 0 if your employer doesn’t give them.">
            {(id) => (
              <NumberInput
                id={id}
                value={personal.daysPerYear}
                step={1}
                suffix="days"
                onChange={(v) => {
                  const days = Math.max(0, Math.round(v ?? 0));
                  setPersonal({ daysPerYear: days, ...(m.personal ? {} : { balance: days * p.hoursPerDay, asOf: todayISO() }) });
                }}
              />
            )}
          </Field>
          {personal.daysPerYear > 0 ? (
            <Field label="Days left right now">
              {(id) => (
                <NumberInput
                  id={id}
                  value={Math.round((personal.balance / p.hoursPerDay) * 100) / 100}
                  step={0.5}
                  suffix="days"
                  onChange={(v) => setPersonal({ balance: Math.max(0, v ?? 0) * p.hoursPerDay, asOf: todayISO() })}
                />
              )}
            </Field>
          ) : null}
        </div>
        {personal.daysPerYear > 0 ? (
          <>
            <div className="field">
              <span className="label">New days arrive on</span>
              <div className="row tight">
                <select
                  aria-label="Personal days month"
                  value={personalMonth}
                  onChange={(e) => setPersonal({ resetDate: `${String(e.target.value).padStart(2, '0')}-${String(personalDay).padStart(2, '0')}` })}
                >
                  {MONTHS.map((mo, i) => (
                    <option key={mo} value={i + 1}>
                      {mo}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Personal days day"
                  value={personalDay}
                  onChange={(e) => setPersonal({ resetDate: `${String(personalMonth).padStart(2, '0')}-${String(e.target.value).padStart(2, '0')}` })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="hint">
              Unused personal days are lost when the new ones arrive. To use one, press and hold a day on the calendar (or right-click it)
              and choose Personal.
            </p>
          </>
        ) : null}
      </section>

      <section>
        <h2>Workdays and holidays</h2>
        <div className="row">
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
        <div className="field">
          <span className="label">Holidays</span>
          <p className="hint">
            Choose which holidays appear on your calendar, and which your employer gives as paid days off. A holiday that’s only shown is
            still a workday.
          </p>
          <ul className="plain-list holiday-choices">
            {listed.map((c) => (
              <li key={c.name}>
                <span className="holiday-choice-name">
                  {c.name}
                  <small>{formatDate(c.next, 'short')}</small>
                </span>
                <Segmented
                  label={`${c.name} on your calendar`}
                  value={holidayState(c.name)}
                  onChange={(v) => setHoliday(c.name, v)}
                  options={[
                    { value: 'hidden', label: 'Hide' },
                    { value: 'shown', label: 'Show' },
                    { value: 'paid', label: 'Paid' },
                  ]}
                />
              </li>
            ))}
          </ul>
          {hiddenCount > 0 || allHolidays ? (
            <button type="button" className="link" onClick={() => setAllHolidays((a) => !a)}>
              {allHolidays ? 'Show only the holidays on my calendar' : `More holidays (${hiddenCount})`}
            </button>
          ) : null}
        </div>
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
      </section>
    </>
  );
}
