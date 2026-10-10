import { useMemo, useState } from 'react';
import { addDays, formatDate, type ISODate } from '../engine/dates';
import { forecastHousehold, nextLoss } from '../engine/forecast';
import type { Household } from '../engine/types';
import { days, hours, joinNames } from '../format';
import { BalanceChart } from './BalanceChart';
import { TripCard } from './TripCard';
import { Segmented } from './ui';

type Range = '6' | '12' | '24';

export function ForecastView({
  household,
  today,
  onOpenTrip,
  onPlanTrip,
  onSeeTrips,
}: {
  household: Household;
  today: ISODate;
  onOpenTrip: (id: string) => void;
  onPlanTrip: () => void;
  onSeeTrips: () => void;
}) {
  const [range, setRange] = useState<Range>('12');
  const [withTentative, setWithTentative] = useState(true);
  const until = addDays(today, Number(range) * 30.5);

  const forecasts = useMemo(
    () => forecastHousehold(household, { from: today, until, confirmedOnly: !withTentative }),
    [household, today, until, withTentative],
  );

  const members = household.members;
  const overdrawn = members.filter((m) => forecasts[m.id].firstOverdrawn);
  const belowBuffer = members.filter((m) => forecasts[m.id].firstBelowBuffer && !forecasts[m.id].firstOverdrawn);
  const losses = members
    .map((m) => ({ m, loss: nextLoss(forecasts[m.id], today) }))
    .filter((x) => x.loss && x.loss.hours >= 0.5);

  const everyone = members.length === 1 ? 'You stay' : members.length === 2 ? 'Both of you stay' : 'Everyone stays';
  let verdict: string;
  let tone: 'good' | 'warn' | 'bad' = 'good';
  if (overdrawn.length > 0) {
    const m = overdrawn[0];
    verdict = `${m.name} runs out of PTO on ${formatDate(forecasts[m.id].firstOverdrawn!, 'medium')}.`;
    tone = 'bad';
  } else if (belowBuffer.length > 0) {
    const m = belowBuffer[0];
    verdict = `${m.name} dips under the ${hours(m.buffer).replace(' h', '-hour')} cushion on ${formatDate(forecasts[m.id].firstBelowBuffer!, 'medium')}.`;
    tone = 'warn';
  } else {
    verdict = `${everyone} above ${members.some((m) => m.buffer > 0) ? 'your cushion' : 'zero'} through ${formatDate(until, 'medium')}.`;
  }

  const upcoming = household.trips
    .filter((t) => t.end >= today)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(0, 3);

  return (
    <div className="forecast">
      <section className={`verdict ${tone}`} aria-live="polite">
        <h1>{verdict}</h1>
        {losses.length > 0 ? (
          <p className="loss">
            {losses.map(({ m, loss }, i) => (
              <span key={m.id}>
                {i > 0 ? ' ' : ''}
                {m.name} forfeits {hours(loss!.hours)} on {formatDate(loss!.date, 'medium')} unless those hours are used.
              </span>
            ))}{' '}
            <button type="button" className="link" onClick={onPlanTrip}>
              Plan days off
            </button>
          </p>
        ) : null}
        {!withTentative && household.trips.some((t) => t.status === 'tentative') ? (
          <p className="hint">Counting confirmed trips only.</p>
        ) : null}
      </section>

      <section className="people-strip" aria-label="Balances">
        {members.map((m) => {
          const f = forecasts[m.id];
          const now = f.balanceOn(today);
          return (
            <div key={m.id} className="person-stat" style={{ ['--person' as string]: m.color }}>
              <span className="person-name">
                <span className="dot" aria-hidden="true" />
                {m.name}
              </span>
              <span className="person-now">
                {hours(now)} <span className="person-days">{days(now, m.policy.hoursPerDay)}</span>
              </span>
              <span className="person-low">
                Lowest ahead {hours(f.low.balance)} on {formatDate(f.low.date, 'short')}
              </span>
            </div>
          );
        })}
      </section>

      <section className="chart-card">
        <div className="chart-controls">
          <Segmented
            label="Forecast range"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6 months' },
              { value: '12', label: '1 year' },
              { value: '24', label: '2 years' },
            ]}
          />
          <label className="check">
            <input type="checkbox" checked={withTentative} onChange={(e) => setWithTentative(e.target.checked)} />
            Include tentative trips
          </label>
        </div>
        <BalanceChart
          household={household}
          forecasts={forecasts}
          from={addDays(today, -14)}
          until={until}
          today={today}
          trips={withTentative ? household.trips : household.trips.filter((t) => t.status === 'confirmed')}
        />
        <p className="legend">
          {members.map((m) => (
            <span key={m.id}>
              <span className="swatch" style={{ background: m.color }} aria-hidden="true" />
              {m.name}
              {m.buffer > 0 ? ` (dashed line: ${hours(m.buffer)} cushion)` : ''}
            </span>
          ))}
          <span>
            <span className="swatch band" aria-hidden="true" />
            Trips
          </span>
        </p>
      </section>

      <section className="upcoming">
        <div className="section-head">
          <h2>Coming up</h2>
          {household.trips.length > 3 ? (
            <button type="button" className="link" onClick={onSeeTrips}>
              All trips
            </button>
          ) : null}
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">
            <p>No trips planned yet. Add one to see how it changes {joinNames(members.map((m) => m.name)) || 'your'} balance.</p>
            <button type="button" className="primary" onClick={onPlanTrip}>
              Plan a trip
            </button>
          </div>
        ) : (
          <div className="passes">
            {upcoming.map((t) => (
              <TripCard key={t.id} trip={t} household={household} onOpen={() => onOpenTrip(t.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
