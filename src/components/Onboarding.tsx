import { useState } from 'react';
import type { AccrualMethod, Household } from '../engine/types';
import { blankMemberInput, EVENTS_PER_YEAR, METHOD_LABELS, newHousehold, newMember, type NewMemberInput } from '../data/defaults';
import { days, hours, round2 } from '../format';
import { Field, NumberInput } from './ui';

function PersonSetup({ title, value, onChange }: { title: string; value: NewMemberInput; onChange: (v: NewMemberInput) => void }) {
  const set = (patch: Partial<NewMemberInput>) => onChange({ ...value, ...patch });
  const yearly = round2(value.rate * EVENTS_PER_YEAR[value.method]);
  return (
    <fieldset>
      <legend>{title}</legend>
      <Field label="Name">{(id) => <input id={id} value={value.name} autoComplete="given-name" onChange={(e) => set({ name: e.target.value })} />}</Field>
      <div className="row">
        <Field label="PTO balance right now">
          {(id) => <NumberInput id={id} value={value.balance} suffix="h" onChange={(v) => set({ balance: v ?? 0 })} />}
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
        <Field label={value.method === 'annual' ? 'Hours each year' : 'Hours added each time'} hint={`About ${hours(yearly)} (${days(yearly, 8)}) a year`}>
          {(id) => <NumberInput id={id} value={value.rate} suffix="h" onChange={(v) => set({ rate: v ?? 0 })} />}
        </Field>
        {value.method !== 'semimonthly' ? (
          <Field label={value.method === 'annual' ? 'Date it lands' : 'A payday it gets added'}>
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
  const [partner, setPartner] = useState<NewMemberInput>(blankMemberInput());
  const [withPartner, setWithPartner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = you.name.trim() !== '' && (!withPartner || partner.name.trim() !== '');

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
          const members = [newMember(you, 0), ...(withPartner ? [newMember(partner, 1)] : [])];
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
        <label className="check">
          <input type="checkbox" checked={withPartner} onChange={(e) => setWithPartner(e.target.checked)} />
          Also add a partner (you can do this later)
        </label>
        {withPartner ? <PersonSetup title="Your partner" value={partner} onChange={setPartner} /> : null}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary wide" disabled={!ready || busy}>
          {busy ? (busyLabel ?? 'Creating…') : 'Create plan'}
        </button>
      </form>
    </main>
  );
}
