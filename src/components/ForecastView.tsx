import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, formatRange, toDay, type ISODate } from '../engine/dates';
import { forecastHousehold, nextLoss, type MemberForecast } from '../engine/forecast';
import type { Household, Member, Trip } from '../engine/types';
import { amount, joinNames, sizeAdjective } from '../format';
import { BalanceChart, type DayRange } from './BalanceChart';
import { TripCard } from './TripCard';
import { Segmented, Sheet } from './ui';

type Range = '6' | '12' | '24' | 'custom';

export interface PlanPrefill {
  start: ISODate;
  end: ISODate;
  memberIds: string[];
}

function useNarrow(): boolean {
  const query = '(max-width: 959px)';
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** One sentence that answers "does the plan work?" */
function verdictFor(h: Household, f: Record<string, MemberForecast>, windowStart: ISODate, windowEnd: ISODate, today: ISODate) {
  const solo = h.members.length === 1;
  const units = h.units ?? 'days';
  const who = (m: Member) => (solo ? 'You' : m.name);
  const overdrawn = h.members.find((m) => f[m.id].firstOverdrawn);
  if (overdrawn) {
    return {
      tone: 'bad' as const,
      text: `${who(overdrawn)} ${solo ? 'run' : 'runs'} out of PTO on ${formatDate(f[overdrawn.id].firstOverdrawn!, 'medium')}.`,
    };
  }
  const under = h.members.find((m) => f[m.id].firstBelowBuffer);
  if (under) {
    return {
      tone: 'warn' as const,
      text: `${who(under)} ${solo ? 'dip' : 'dips'} under ${solo ? 'your' : 'the'} ${sizeAdjective(under.buffer, under.policy.hoursPerDay, units)} cushion on ${formatDate(f[under.id].firstBelowBuffer!, 'medium')}.`,
    };
  }
  const subject = solo ? 'You stay' : h.members.length === 2 ? 'Both of you stay' : 'Everyone stays';
  const floor = h.members.some((m) => m.buffer > 0) ? 'your cushion' : 'zero';
  const span = windowStart > today ? `from ${formatDate(windowStart, 'medium')} through ${formatDate(windowEnd, 'medium')}` : `through ${formatDate(windowEnd, 'medium')}`;
  return { tone: 'good' as const, text: `${subject} above ${floor} ${span}.` };
}

export function ForecastView({
  household,
  today,
  onOpenTrip,
  onPlanTrip,
  onSeeTrips,
  onAddPartner,
}: {
  household: Household;
  today: ISODate;
  onOpenTrip: (id: string) => void;
  onPlanTrip: (prefill?: PlanPrefill) => void;
  onSeeTrips: () => void;
  onAddPartner: () => void;
}) {
  const units = household.units ?? 'days';
  const members = household.members;
  const solo = members.length === 1;
  const narrow = useNarrow();

  const [range, setRange] = useState<Range>('12');
  const [customFrom, setCustomFrom] = useState<ISODate>(today);
  const [customTo, setCustomTo] = useState<ISODate>(addDays(today, 365));
  const [withIdeas, setWithIdeas] = useState(true);
  const [draft, setDraft] = useState<DayRange | null>(null);
  const [asking, setAsking] = useState<DayRange | null>(null);
  const [open, setOpen] = useState(false);

  const customOk = toDay(customTo) - toDay(customFrom) >= 14;
  const windowStart = range === 'custom' && customOk ? customFrom : addDays(today, -14);
  const windowEnd = range === 'custom' && customOk ? customTo : addDays(today, Math.round(Number(range === 'custom' ? 12 : range) * 30.44));
  const lowsFrom = windowStart > today ? windowStart : today;

  const shownTrips = withIdeas ? household.trips : household.trips.filter((t) => t.status === 'confirmed');
  const opts = { from: lowsFrom, until: windowEnd, confirmedOnly: !withIdeas };
  const forecasts = useMemo(() => forecastHousehold(household, opts), [household, lowsFrom, windowEnd, withIdeas]); // eslint-disable-line react-hooks/exhaustive-deps

  // While dragging (or choosing who's going), preview the trip for everyone.
  const pending = asking ?? draft;
  const draftTrip: Trip | null = pending
    ? { id: '__draft__', title: 'New trip', start: pending.start, end: pending.end, memberIds: members.map((m) => m.id), hoursPerDay: null, status: 'tentative' }
    : null;
  const previews = useMemo(
    () => (draftTrip ? forecastHousehold({ ...household, trips: [...household.trips, draftTrip] }, opts) : null),
    [household, draftTrip?.start, draftTrip?.end, lowsFrom, windowEnd, withIdeas], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const verdict = verdictFor(household, forecasts, windowStart > today ? windowStart : today, windowEnd, today);
  const losses = members.map((m) => ({ m, loss: nextLoss(forecasts[m.id], today) })).filter((x) => x.loss && x.loss.hours >= 0.5);
  const upcoming = household.trips
    .filter((t) => t.end >= today)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(0, 4);

  const finishSelection = (r: DayRange) => {
    if (solo) {
      setDraft(null);
      onPlanTrip({ ...r, memberIds: [members[0].id] });
    } else {
      setDraft(null);
      setAsking(r);
    }
  };

  // Measure the panel's resting height so the graph ends just above it.
  const peek = useRef<HTMLDivElement>(null);
  const [peekH, setPeekH] = useState(120);
  useEffect(() => {
    const el = peek.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setPeekH(Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Swipe the handle up or down to open or close the panel.
  const swipe = useRef<number | null>(null);
  const swiped = useRef(false);

  return (
    <div className="forecast" style={narrow ? { ['--peek' as string]: `${peekH}px` } : undefined}>
      <div className="forecast-main">
        <header className={`verdict-bar ${verdict.tone}`}>
          <h1 aria-live="polite">{verdict.text}</h1>
          {losses.length > 0 ? (
            <p className="loss">
              {losses
                .map(({ m, loss }) =>
                  solo
                    ? `You forfeit ${amount(loss!.hours, m.policy.hoursPerDay, units)} on ${formatDate(loss!.date, 'medium')} unless you use them.`
                    : `${m.name} forfeits ${amount(loss!.hours, m.policy.hoursPerDay, units)} on ${formatDate(loss!.date, 'medium')}.`,
                )
                .join(' ')}
            </p>
          ) : null}
        </header>

        <div className="range-bar">
          <Segmented
            label="Forecast range"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6 mo' },
              { value: '12', label: '1 yr' },
              { value: '24', label: '2 yr' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {range === 'custom' ? (
            <div className="custom-range">
              <label>
                <span>From</span>
                <input id="range-from" type="date" value={customFrom} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input id="range-to" type="date" value={customTo} min={addDays(customFrom, 14)} onChange={(e) => e.target.value && setCustomTo(e.target.value)} />
              </label>
              {!customOk ? <span className="hint">Pick at least two weeks.</span> : null}
            </div>
          ) : null}
        </div>

        <div className="chart-stage">
          <BalanceChart
            household={household}
            forecasts={previews ?? forecasts}
            ghost={previews ? forecasts : undefined}
            from={windowStart}
            until={windowEnd}
            today={today}
            units={units}
            trips={draftTrip ? [...shownTrips, draftTrip] : shownTrips}
            focusTripId={draftTrip?.id}
            onDraftRange={setDraft}
            onSelectRange={finishSelection}
          />
        </div>
        <p className="chart-hint">
          {narrow ? 'Press and hold the graph, then drag to add a trip.' : 'Drag across the graph to add a trip.'}
        </p>
      </div>

      <aside className={`panel ${open ? 'open' : ''}`} aria-label="Balances and trips">
        <div className="panel-peek" ref={peek}>
          {narrow ? (
            <button
              type="button"
              className="panel-handle"
              aria-expanded={open}
              aria-label={open ? 'Hide balances and trips' : 'Show balances and trips'}
              onClick={() => {
                if (swiped.current) swiped.current = false;
                else setOpen((o) => !o);
              }}
              onPointerDown={(e) => (swipe.current = e.clientY)}
              onPointerUp={(e) => {
                if (swipe.current === null) return;
                const dy = e.clientY - swipe.current;
                swipe.current = null;
                if (Math.abs(dy) > 24) {
                  swiped.current = true;
                  setOpen(dy < 0);
                }
              }}
            >
              <span className="grabber" aria-hidden="true" />
            </button>
          ) : null}
          <div className="balances">
            {members.map((m) => {
              const f = forecasts[m.id];
              return (
                <div key={m.id} className="balance" style={{ ['--person' as string]: m.color }}>
                  <span className="balance-who">
                    {solo ? 'Now' : (
                      <>
                        <span className="dot" aria-hidden="true" />
                        {m.name}
                      </>
                    )}
                  </span>
                  <span className="balance-now">{amount(f.balanceOn(today), m.policy.hoursPerDay, units)}</span>
                  <span className="balance-low">
                    Lowest {amount(f.low.balance, m.policy.hoursPerDay, units)}, {formatDate(f.low.date, 'short')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-body" hidden={narrow && !open}>
          <div className="panel-actions">
            <button type="button" className="primary" onClick={() => onPlanTrip()}>
              Plan a trip
            </button>
            <label className="check">
              <input type="checkbox" checked={withIdeas} onChange={(e) => setWithIdeas(e.target.checked)} />
              Include ideas
            </label>
          </div>

          <div className="section-head">
            <h2>Coming up</h2>
            {household.trips.length > upcoming.length ? (
              <button type="button" className="link" onClick={onSeeTrips}>
                All trips
              </button>
            ) : null}
          </div>
          {upcoming.length === 0 ? (
            <p className="empty-line">No trips yet. Drag across the graph, or use Plan a trip.</p>
          ) : (
            <div className="passes">
              {upcoming.map((t) => (
                <TripCard key={t.id} trip={t} household={household} onOpen={() => onOpenTrip(t.id)} />
              ))}
            </div>
          )}

          {solo ? (
            <div className="partner-offer">
              <p>Planning time off with a partner? Add them to see both balances on one graph.</p>
              <button type="button" onClick={onAddPartner}>
                Add a partner
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {asking ? (
        <Sheet open title="Who's taking this trip?" onClose={() => setAsking(null)}>
          <p className="lead small">{formatRange(asking.start, asking.end)}</p>
          <div className="who-buttons">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="who"
                style={{ ['--person' as string]: m.color }}
                onClick={() => {
                  onPlanTrip({ ...asking, memberIds: [m.id] });
                  setAsking(null);
                }}
              >
                <span className="dot" aria-hidden="true" />
                {m.name}
              </button>
            ))}
            <button
              type="button"
              className="who both"
              onClick={() => {
                onPlanTrip({ ...asking, memberIds: members.map((m) => m.id) });
                setAsking(null);
              }}
            >
              {members.length === 2 ? 'Both of you' : `Everyone (${joinNames(members.map((m) => m.name))})`}
            </button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
