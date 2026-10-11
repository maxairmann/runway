import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, fromDay, partsOf, toDay, weekdayOf, type ISODate } from '../engine/dates';
import { forecastMember, nextLoss, type ForecastOptions } from '../engine/forecast';
import { memberHolidays } from '../engine/holidays';
import { cycleDay, daysOffFromTrips, holidaySets, isWorkday, monthGrid, tripsFromDaysOff } from '../engine/plan';
import type { Household } from '../engine/types';
import { newId } from '../data/ids';
import { amount, toUnits } from '../format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Month = { y: number; m: number };

function shiftMonth(mo: Month, dm: number): Month {
  const idx = mo.y * 12 + (mo.m - 1) + dm;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
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

/** The days a month view shows. On phones: the whole grid plus the next month's first week, all usable. */
function viewDays(mo: Month, extended: boolean): { days: ISODate[]; active: (d: ISODate) => boolean } {
  const grid = monthGrid(mo.y, mo.m);
  if (!extended) return { days: grid, active: (d) => partsOf(toDay(d)).m === mo.m };
  const lastN = toDay(grid[grid.length - 1]);
  const next = shiftMonth(mo, 1);
  const tail = partsOf(lastN).m === next.m ? [] : Array.from({ length: 7 }, (_, i) => fromDay(lastN + 1 + i));
  return { days: [...grid, ...tail], active: () => true };
}

function Umbrella() {
  return (
    <svg className="umbrella" viewBox="0 0 24 24" aria-hidden="true">
      <path className="canopy" d="M2.5 11.5C3.4 6.6 7.3 3.5 12 3.5s8.6 3.1 9.5 8c-1.3-1-2.7-1-4 0-1.3-1-2.7-1-4 0-0.5-0.4-1-0.6-1.5-0.6s-1 0.2-1.5 0.6c-1.3-1-2.7-1-4 0-1.3-1-2.7-1-4 0z" />
      <path className="pole" d="M12 3.5V2.2M12 11v7.3a2.2 2.2 0 01-4.4 0" />
    </svg>
  );
}

export function PlanView({
  household,
  today,
  update,
}: {
  household: Household;
  today: ISODate;
  update: (fn: (h: Household) => Household) => void;
}) {
  const units = household.units ?? 'days';
  const me = household.members[0];
  const perDay = me.policy.hoursPerDay;
  const narrow = useNarrow();
  const t = partsOf(toDay(today));
  const first: Month = { y: t.y, m: t.m };
  const [month, setMonth] = useState<Month>(first);
  const [popped, setPopped] = useState<ISODate | null>(null);

  const shown = useMemo(() => (narrow ? [month] : [0, 1, 2].map((i) => shiftMonth(month, i))), [month, narrow]);
  const views = useMemo(() => shown.map((mo) => ({ ...mo, ...viewDays(mo, narrow) })), [shown, narrow]);
  const lastShown = shown[shown.length - 1];

  const until = (() => {
    const a = addDays(today, 730);
    const b = addDays(`${lastShown.y}-${String(lastShown.m).padStart(2, '0')}-01`, 400);
    return a > b ? a : b;
  })();
  const opts: ForecastOptions = { from: today, until };

  const daysOff = useMemo(() => daysOffFromTrips(household.trips, me), [household.trips, me]);
  const forecast = useMemo(() => forecastMember(me, household.trips, opts), [household.trips, me, until]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paydays (and any other day PTO is added) from today on, with the balance right after.
  const paydays = useMemo(() => {
    const out = new Map<ISODate, number>();
    for (const e of forecast.events) if ((e.kind === 'accrual' || e.kind === 'capped') && e.date >= today) out.set(e.date, forecast.balanceOn(e.date));
    return out;
  }, [forecast, today]);

  const hol = useMemo(() => holidaySets([me], month.y - 1, month.y + 2).get(me.id), [me, month.y]);
  const holidayNames = useMemo(() => new Map(memberHolidays(me, month.y - 1, month.y + 2).map((h) => [h.date, h.name])), [me, month.y]);
  const floor = -me.policy.allowNegative;

  const tap = (d: ISODate) => {
    const next = cycleDay(daysOff, d);
    if (next[d] === 1) setPopped(d);
    update((h) => ({ ...h, trips: tripsFromDaysOff(next, me, () => newId('trip')) }));
  };

  const totalOff = Object.entries(daysOff)
    .filter(([d]) => d >= today)
    .reduce((s, [, v]) => s + v, 0);
  const loss = nextLoss(forecast, today);
  const low = forecast.low;
  const atFirst = month.y === first.y && month.m === first.m;
  const jumpOptions = Array.from({ length: 24 }, (_, i) => shiftMonth(first, i));

  // Swipe left or right on the calendar to change months (phones).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0];
    swipe.current = { x: tch.clientX, y: tch.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const tch = e.changedTouches[0];
    const dx = tch.clientX - s.x;
    const dy = tch.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) setMonth((mo) => shiftMonth(mo, 1));
    else if (!atFirst) setMonth((mo) => shiftMonth(mo, -1));
  };

  const short = (v: number) => {
    const u = toUnits(v, perDay, units);
    const r = Math.round(u * 10) / 10;
    const s = (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('-', '−');
    return units === 'days' ? `${s}d` : `${s}h`;
  };

  return (
    <div className="plan">
      <header className="plan-head">
        <h1>Plan days off</h1>
        <p className="plan-banked">You have {amount(forecast.balanceOn(today), perDay, units)} banked today.</p>
        {loss && loss.hours >= 0.5 ? (
          <p className="plan-loss">
            You forfeit {amount(loss.hours, perDay, units)} on {formatDate(loss.date, 'medium')} unless you use them first.
          </p>
        ) : null}
      </header>

      <section className="calendar" aria-label="Calendar" onTouchStart={narrow ? onTouchStart : undefined} onTouchEnd={narrow ? onTouchEnd : undefined}>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" disabled={atFirst} onClick={() => setMonth((mo) => shiftMonth(mo, -1))}>
            ‹
          </button>
          <label className="month-jump">
            <span className="visually-hidden">Jump to month</span>
            <select
              id="month-jump"
              value={`${month.y}-${month.m}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setMonth({ y, m });
              }}
            >
              {jumpOptions.map((mo) => (
                <option key={`${mo.y}-${mo.m}`} value={`${mo.y}-${mo.m}`}>
                  {narrow
                    ? `${MONTHS[mo.m - 1]} ${mo.y}`
                    : (() => {
                        const end = shiftMonth(mo, 2);
                        return `${MONTHS[mo.m - 1].slice(0, 3)}${mo.y === end.y ? '' : ` ${mo.y}`} – ${MONTHS[end.m - 1].slice(0, 3)} ${end.y}`;
                      })()}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setMonth((mo) => shiftMonth(mo, 1))}>
            ›
          </button>
        </div>

        <div className="months">
          {views.map((v) => (
            <div key={`${v.y}-${v.m}`} className="month">
              {!narrow ? (
                <h3>
                  {MONTHS[v.m - 1]} {v.y}
                </h3>
              ) : null}
              <div className="cal-grid" role="grid" aria-label={`${MONTHS[v.m - 1]} ${v.y}`}>
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="cal-dow" aria-hidden="true">
                    {w}
                  </span>
                ))}
                {v.days.map((d) => {
                  if (!v.active(d)) return <span key={d} className="cal-day out" aria-hidden="true" />;
                  const n = toDay(d);
                  const p = partsOf(n);
                  const adjacent = p.m !== v.m;
                  const past = d < today;
                  const work = isWorkday(me, n, hol);
                  const off = daysOff[d];
                  const holiday = holidayNames.get(d);
                  const payday = paydays.get(d);
                  const below = !!off && !past && forecast.balanceOn(d) < floor - 1e-9;
                  const cls = [
                    'cal-day',
                    adjacent ? 'adjacent' : '',
                    past ? 'past' : '',
                    !work ? 'weekend' : '',
                    holiday ? 'holiday' : '',
                    off === 1 ? 'day-off' : '',
                    off === 0.5 ? 'day-off half' : '',
                    below ? 'below' : '',
                    d === today ? 'today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const label = [
                    `${WEEKDAY_NAMES[weekdayOf(n)]}, ${formatDate(d, 'short')}`,
                    holiday ? `${holiday}, paid holiday` : '',
                    off === 1 ? 'day off' : off === 0.5 ? 'half day off' : '',
                    below ? 'puts you below zero' : '',
                    payday !== undefined ? `payday, ${amount(payday, perDay, units)} banked after` : '',
                  ]
                    .filter(Boolean)
                    .join('. ');
                  const tappable = !past && work;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={cls}
                      disabled={!tappable}
                      aria-label={label}
                      aria-pressed={tappable ? !!off : undefined}
                      onClick={() => tap(d)}
                    >
                      <span className="cal-num">
                        {adjacent && p.d === 1 ? <small>{MONTHS[p.m - 1].slice(0, 3)} </small> : null}
                        {p.d}
                      </span>
                      {off ? (
                        <span className={`off-mark ${popped === d ? 'pop' : ''}`} onAnimationEnd={() => setPopped(null)}>
                          <Umbrella />
                          {off === 0.5 ? <span className="half-label">½</span> : null}
                        </span>
                      ) : null}
                      {payday !== undefined ? <span className={`payday ${payday < floor - 1e-9 ? 'neg' : ''}`}>{short(payday)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="cal-key">
          <span>
            <span className="key-umbrella" aria-hidden="true">
              <Umbrella />
            </span>
            Day off. Tap again for a half day, a third time to clear.
          </span>
          <span>
            <span className="payday sample" aria-hidden="true">
              {units === 'days' ? '4.5d' : '36h'}
            </span>
            Payday: what you have banked once PTO is added.
          </span>
        </p>
      </section>

      <div className={`plan-bar ${forecast.firstOverdrawn ? 'problem' : ''}`} aria-live="polite">
        {forecast.firstOverdrawn ? (
          <p>
            <strong>
              You’d be {amount(Math.abs(forecast.balanceOn(forecast.firstOverdrawn) - floor), perDay, units)} short on{' '}
              {formatDate(forecast.firstOverdrawn, 'medium')}.
            </strong>{' '}
            Remove a red day or move it later.
          </p>
        ) : totalOff > 0 ? (
          <p>
            <strong>{totalOff === 1 ? '1 day' : `${totalOff} days`} off planned.</strong> Lowest point ahead: {amount(low.balance, perDay, units)} on{' '}
            {formatDate(low.date, 'short')}.
          </p>
        ) : (
          <p>Tap any workday to take it off.</p>
        )}
      </div>
    </div>
  );
}
