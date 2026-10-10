import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, formatRange, fromDay, partsOf, toDay, weekdayOf, type ISODate } from '../engine/dates';
import { forecastMember, nextLoss, tripCost, type ForecastOptions, type MemberForecast } from '../engine/forecast';
import { memberHolidays } from '../engine/holidays';
import { groupPicks, groupToTrip, holidaySets, isWorkday, monthGrid, picksAsTrips, type Picks } from '../engine/plan';
import type { Household, Trip } from '../engine/types';
import { newId } from '../data/ids';
import { amount, toUnits } from '../format';
import { Sheet } from './ui';

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
  // If the grid already ends partway into next month, its first week is showing; otherwise add the next week.
  const tail = partsOf(lastN).m === next.m ? [] : Array.from({ length: 7 }, (_, i) => fromDay(lastN + 1 + i));
  return { days: [...grid, ...tail], active: () => true };
}

export function PlanView({
  household,
  today,
  picks,
  setPicks,
  onSaveTrips,
  onClearPicks,
  onOpenTrip,
}: {
  household: Household;
  today: ISODate;
  picks: Picks;
  setPicks: (fn: (p: Picks) => Picks) => void;
  onSaveTrips: (trips: Trip[]) => void;
  onClearPicks: () => void;
  onOpenTrip: (id: string) => void;
}) {
  const units = household.units ?? 'days';
  const me = household.members[0];
  const perDay = me.policy.hoursPerDay;
  const narrow = useNarrow();
  const t = partsOf(toDay(today));
  const first: Month = { y: t.y, m: t.m };
  const [month, setMonth] = useState<Month>(first);
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => (narrow ? [month] : [0, 1, 2].map((i) => shiftMonth(month, i))), [month, narrow]);
  const views = useMemo(() => shown.map((mo) => ({ ...mo, ...viewDays(mo, narrow) })), [shown, narrow]);
  const lastShown = shown[shown.length - 1];

  const until = (() => {
    const a = addDays(today, 730);
    const b = addDays(`${lastShown.y}-${String(lastShown.m).padStart(2, '0')}-01`, 400);
    return a > b ? a : b;
  })();
  const opts: ForecastOptions = { from: today, until };

  const hol = useMemo(() => holidaySets([me], month.y - 1, month.y + 2).get(me.id), [me, month.y]);
  const holidayNames = useMemo(() => new Map(memberHolidays(me, month.y - 1, month.y + 2).map((h) => [h.date, h.name])), [me, month.y]);

  /** Forecast with these picks added; ok means you never go below what your employer allows. */
  const check = (p: Picks): { ok: boolean; overdrawn: ISODate | null; forecast: MemberForecast } => {
    const forecast = forecastMember(me, [...household.trips, ...picksAsTrips(p, [me], [me.id])], opts);
    return { ok: forecast.firstOverdrawn === null, overdrawn: forecast.firstOverdrawn, forecast };
  };

  const current = useMemo(() => check(picks), [household, picks, until]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => check({}), [household, until]); // eslint-disable-line react-hooks/exhaustive-deps

  const tripOn = (d: ISODate) => household.trips.find((tr) => d >= tr.start && d <= tr.end);
  const isWork = (n: number) => isWorkday(me, n, hol);

  // For each open workday on screen: would taking it still fit?
  const affordable = useMemo(() => {
    const out = new Map<ISODate, boolean>();
    for (const v of views) {
      for (const d of v.days) {
        if (!v.active(d) || d < today || picks[d] || tripOn(d) || !isWork(toDay(d)) || out.has(d)) continue;
        out.set(d, check({ ...picks, [d]: 1 }).ok);
      }
    }
    return out;
  }, [views, picks, household, until]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which picked days push the plan over? The ones whose removal would fix it; if none alone does, all of them.
  const flagged = useMemo(() => {
    const out = new Set<ISODate>();
    if (current.ok || !baseline.ok) return out;
    const days = Object.keys(picks);
    for (const d of days) {
      const rest = { ...picks };
      delete rest[d];
      if (check(rest).ok) out.add(d);
    }
    if (out.size === 0) days.forEach((d) => out.add(d));
    return out;
  }, [current.ok, baseline.ok, picks, household, until]); // eslint-disable-line react-hooks/exhaustive-deps

  const cycle = (d: ISODate) =>
    setPicks((p) => {
      const next = { ...p };
      if (!p[d]) next[d] = 1;
      else if (p[d] === 1) next[d] = 0.5;
      else delete next[d];
      return next;
    });

  const groups = groupPicks(picks, [me]);
  const pickedCount = Object.values(picks).reduce((s, v) => s + v, 0);
  const cost = picksAsTrips(picks, [me], [me.id]).reduce((s, tr) => s + tripCost(me, tr), 0);
  const low = current.forecast.low;
  const loss = nextLoss(current.forecast, today);
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

  const fmt = (v: number) => (units === 'days' ? v.toFixed(1) : String(Math.round(v)));

  return (
    <div className="plan">
      <header className="plan-head">
        <h1>Plan days off</h1>
        <p className="plan-banked">You have {amount(current.forecast.balanceOn(today), perDay, units)} banked today.</p>
        {loss && loss.hours >= 0.5 ? (
          <p className="plan-loss">
            You forfeit {amount(loss.hours, perDay, units)} on {formatDate(loss.date, 'medium')} unless you use them first.
          </p>
        ) : null}
      </header>

      {!baseline.ok ? (
        <p className="plan-warning">
          Your saved trips already put you below zero on {formatDate(baseline.overdrawn!, 'medium')}. Shorten or move one in Trips.
        </p>
      ) : null}

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
                  const work = isWork(n);
                  const trip = tripOn(d);
                  const tripHalf =
                    !!trip &&
                    (trip.halfDays?.includes(d) ||
                      (trip.hoursPerDay === null && (trip.dayFraction ?? 1) < 1) ||
                      (trip.hoursPerDay !== null && trip.hoursPerDay < perDay));
                  const pick = picks[d];
                  const holiday = holidayNames.get(d);
                  const short = affordable.get(d) === false;
                  const flag = flagged.has(d);
                  const value = !past && work ? toUnits(current.forecast.balanceOn(d), perDay, units) : null;
                  const cls = [
                    'cal-day',
                    adjacent ? 'adjacent' : '',
                    past ? 'past' : '',
                    !work ? 'off' : '',
                    holiday ? 'holiday' : '',
                    trip ? 'trip' : '',
                    tripHalf ? 'trip-half' : '',
                    pick === 1 ? 'picked' : '',
                    pick === 0.5 ? 'picked half' : '',
                    short ? 'short' : '',
                    flag ? 'flagged' : '',
                    d === today ? 'today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const tappable = !past && (work || !!trip);
                  const label = [
                    `${WEEKDAY_NAMES[weekdayOf(n)]}, ${formatDate(d, 'short')}`,
                    holiday ? `${holiday}, paid holiday` : '',
                    trip ? `${trip.title}${tripHalf ? ', half day' : ''}, planned` : '',
                    pick === 1 ? 'picked, full day' : pick === 0.5 ? 'picked, half day' : '',
                    short ? 'would put you below zero later' : '',
                    value !== null ? `${fmt(value)} ${units} banked` : '',
                  ]
                    .filter(Boolean)
                    .join('. ');
                  return (
                    <button
                      key={d}
                      type="button"
                      className={cls}
                      disabled={!tappable}
                      aria-label={label}
                      aria-pressed={pick ? true : undefined}
                      onClick={() => (trip ? onOpenTrip(trip.id) : cycle(d))}
                    >
                      <span className="cal-num">
                        {adjacent && p.d === 1 ? <small>{MONTHS[p.m - 1].slice(0, 3)} </small> : null}
                        {p.d}
                      </span>
                      {value !== null && !trip ? <span className="cal-bal">{fmt(value)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="cal-key">
          <span>
            <span className="key picked" aria-hidden="true" /> Picked
          </span>
          <span>
            <span className="key half" aria-hidden="true" /> Half day
          </span>
          <span>
            <span className="key booked" aria-hidden="true" /> Planned
          </span>
          <span>
            <span className="key short" aria-hidden="true" /> Would put you below zero
          </span>
          <span className="key-note">Small numbers: {units} banked that day.</span>
        </p>
      </section>

      <div className={`plan-bar ${current.ok ? '' : 'problem'}`} aria-live="polite">
        {pickedCount === 0 ? (
          <p>Tap the days you want off. Tap again for a half day, a third time to clear.</p>
        ) : (
          <>
            <div className="plan-summary">
              <strong>
                {pickedCount === 1 ? '1 day' : `${pickedCount} days`} picked
                {Math.abs(cost / perDay - pickedCount) > 0.05 ? `, ${amount(cost, perDay, units)} of PTO` : ''}
              </strong>
              {current.ok ? (
                <span>
                  Lowest after: {amount(low.balance, perDay, units)} on {formatDate(low.date, 'short')}.
                </span>
              ) : (
                <span className="bad">Puts you below zero on {formatDate(current.overdrawn!, 'medium')}.</span>
              )}
            </div>
            <div className="plan-actions">
              <button type="button" className="ghost" onClick={onClearPicks}>
                Clear
              </button>
              <button type="button" className="primary" onClick={() => setSaving(true)}>
                Save
              </button>
            </div>
          </>
        )}
      </div>

      {saving ? (
        <SaveSheet
          groups={groups}
          ok={current.ok}
          costOf={(tr) => amount(tripCost(me, tr), perDay, units)}
          memberId={me.id}
          onClose={() => setSaving(false)}
          onSave={(trips) => {
            onSaveTrips(trips);
            setSaving(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SaveSheet({
  groups,
  ok,
  costOf,
  memberId,
  onClose,
  onSave,
}: {
  groups: ReturnType<typeof groupPicks>;
  ok: boolean;
  costOf: (t: Trip) => string;
  memberId: string;
  onClose: () => void;
  onSave: (trips: Trip[]) => void;
}) {
  const [names, setNames] = useState<string[]>(groups.map(() => ''));
  const ids = useMemo(() => groups.map(() => newId('trip')), [groups.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const trips = groups.map((g, i) => groupToTrip(g, [memberId], ids[i], names[i].trim() || 'Time off', 'confirmed'));
  return (
    <Sheet
      open
      title={groups.length === 1 ? 'Save this time off' : `Save ${groups.length} trips`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Keep picking
          </button>
          <button type="button" className="primary" onClick={() => onSave(trips)}>
            Save
          </button>
        </>
      }
    >
      {!ok ? <p className="plan-warning">These days put you below zero. You can save them anyway and adjust later.</p> : null}
      <ul className="save-list">
        {groups.map((g, i) => (
          <li key={g.start}>
            <div className="save-range">
              <strong>{formatRange(g.start, g.end)}</strong>
              <span>{costOf(trips[i])}</span>
            </div>
            <input
              id={`save-name-${i}`}
              aria-label={`Name for ${formatRange(g.start, g.end)}`}
              placeholder="Name it (optional)"
              value={names[i]}
              onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
