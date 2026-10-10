import { useState } from 'react';
import type { AccrualMethod, Household } from '../engine/types';
import { blankMemberInput, EVENTS_PER_YEAR, METHOD_LABELS, newHousehold, newMember, type NewMemberInput } from '../data/defaults';
import { days, hours, round2 } from '../format';
import { Field, NumberInput } from './ui';

function PersonSetup({ title, value, onChange }: { title: string; value: NewMemberInput; onChange: (v: NewMemberInput) => void }) {
  const set = (patch: Partial<NewMemberInput>) => onChange({ ...value, ...patch });
  const yearly = round2((value.rate ?? 0) * EVENTS_PER_YEAR[value.method]);
  return (
    <fieldset>
      <legend>{title}</legend>
      <Field label="Name">{(id) => <input id={id} value={value.name} autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} />}</Field>
      <div className="row">
        <Field label="PTO balance right now">
          {(id) => <NumberInput id={id} value={value.balance} allowEmpty placeholder="e.g. 40" suffix="h" onChange={(v) => set({ balance: v })} />}
        </Field>
        <Field label="As of">
          {(id) => <input id={id} type="date" value={value.asOf} onChange={(e) => e.target.value && set({ asOf: e.target.value })} />}
        </Field>
      </div>
      <Field label="How often PTO is added">
        {(id) => (
          <select id={id} value={value.method} onChange={(e) => set({ method: e.target.value as AccrualMethod })}>
            {Object.entries(METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="row">
        <Field
          label={value.method === 'annual' ? 'Hours each year' : 'Hours added each time'}
          hint={value.rate ? `About ${hours(yearly)} a year, or ${days(yearly, 8)} of 8 hours` : 'Your paystub lists this as accrual or earned hours.'}
        >
          {(id) => <NumberInput id={id} value={value.rate} allowEmpty placeholder="e.g. 7.69" suffix="h" onChange={(v) => set({ rate: v })} />}
        </Field>
        {value.method !== 'semimonthly' ? (
          <Field label={value.method === 'annual' ? 'Date it lands' : 'Your most recent payday'}>
            {(id) => <input id={id} type="date" value={value.anchor} onChange={(e) => e.target.value && set({ anchor: e.target.value })} />}
          </Field>
        ) : null}
      </div>
    </fieldset>
  );
}

export function Onboarding({
  onDone,
  onBack,
  busyLabel,
}: {
  onDone: (h: Household) => void | Promise<void>;
  onBack: () => void;
  busyLabel?: string;
}) {
  const [you, setYou] = useState<NewMemberInput>(blankMemberInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = you.name.trim() !== '' && you.balance !== null && you.rate !== null && (you.method === 'semimonthly' || you.anchor !== '');

  return (
    <main className="onboarding">
      <button type="button" className="link back" onClick={onBack}>
        Back
      </button>
      <h1>Set up your plan</h1>
      <p className="lead">Your HR portal or paystub has these numbers. You can add caps, holidays, and carryover rules after.</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          const members = [newMember(you, 0)];
          setBusy(true);
          setError(null);
          try {
            await onDone(newHousehold(members));
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <PersonSetup title="Your PTO" value={you} onChange={setYou} />
        <p className="hint">Balances show in days of 8 hours. You can change the length of a day in My rules.</p>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary wide" disabled={!ready || busy}>
          {busy ? (busyLabel ?? 'Creating…') : 'Create plan'}
        </button>
      </form>
    </main>
  );
}
