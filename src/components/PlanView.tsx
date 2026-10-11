import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDate, fromDay, partsOf, toDay, weekdayOf, type ISODate } from '../engine/dates';
import { forecastMember, forecastSick, nextLoss, overdrawnFrom, worstShortfall, type ForecastOptions } from '../engine/forecast';
import { labeledHolidays, paidNames, type HolidayGroup } from '../engine/holidays';
import { cycleDay, holidaySets, isWorkday, monthGrid, setDayKind, splitDaysOff, tripsFromSplit, type DaysOff } from '../engine/plan';
import type { Household } from '../engine/types';
import { newId } from '../data/ids';
import { amount, toUnits } from '../format';
import { Segmented, Sheet } from './ui';
import { CorgiPeek } from './Corgi';

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
  // Show the next month's first two weeks: add whole weeks until the grid reaches its 14th.
  let end = lastN;
  const target = toDay(`${next.y}-${String(next.m).padStart(2, '0')}-14`);
  while (end < target) end += 7;
  const tail = Array.from({ length: end - lastN }, (_, i) => fromDay(lastN + 1 + i));
  return { days: [...grid, ...tail], active: () => true };
}

/** A beach umbrella planted in the sand: a full day off. */
function BeachUmbrella() {
  return (
    <svg className="icon-beach" viewBox="0 0 24 24" aria-hidden="true">
      <path className="sand" d="M2.5 20.5c3-1.6 6.2-1.6 9.5 0s6.5 1.6 9.5 0V22h-19z" />
      <path className="pole" d="M8.2 20.2 13.6 7.4" />
      <path className="canopy" d="M3.4 9.6C5 4.4 11 1.8 16.2 3.9c3.1 1.3 4.9 3.9 5.3 6.9z" />
      <path className="stripe" d="M9.4 3.4c-.6 2-.6 4.5.3 7.1M15.3 3.6c.7 2.1.5 4.6-.6 7.1" />
    </svg>
  );
}

/** A thermometer: a sick day. */
function Thermometer() {
  return (
    <svg className="icon-sick" viewBox="0 0 24 24" aria-hidden="true">
      <path className="tube" d="M9.6 4.6a2.4 2.4 0 0 1 4.8 0v8.9a4.6 4.6 0 1 1-4.8 0z" />
      <path className="mercury" d="M11.1 8.2h1.8v6.3a2.9 2.9 0 1 1-1.8 0z" />
      <path className="ticks" d="M14.4 6.2h1.8M14.4 8.7h1.3M14.4 11.2h1.8" />
    </svg>
  );
}

/** A car: out running errands, part of a day off. */
function Car() {
  return (
    <svg className="icon-car" viewBox="0 0 24 24" aria-hidden="true">
      <path className="body" d="M3 15.2v-3.1c0-.9.6-1.6 1.4-1.8l1.7-.4 1.9-3.4c.4-.7 1.1-1.1 1.9-1.1h5.2c.8 0 1.5.4 1.9 1.1l1.9 3.4 1.7.4c.8.2 1.4.9 1.4 1.8v3.1c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1z" />
      <path className="glass" d="M8.4 9.9 9.7 7.6c.1-.2.3-.3.5-.3h3.6c.2 0 .4.1.5.3l1.3 2.3z" />
      <circle className="wheel" cx="7.3" cy="16.4" r="2" />
      <circle className="wheel" cx="16.7" cy="16.4" r="2" />
    </svg>
  );
}

const HOLD_MS = 450;

/** "May 17–21", "Mar 30 – Apr 2", or "Oct 7". */
function shortRange(start: ISODate, end: ISODate): string {
  const a = partsOf(toDay(start));
  const b = partsOf(toDay(end));
  const mon = (m: number) => MONTHS[m - 1].slice(0, 3);
  if (start === end) return `${mon(a.m)} ${a.d}`;
  if (a.m === b.m && a.y === b.y) return `${mon(a.m)} ${a.d}–${b.d}`;
  return `${mon(a.m)} ${a.d} – ${mon(b.m)} ${b.d}`;
}

interface DayHoliday {
  name: string;
  base: string;
  group: HolidayGroup | 'own';
  paid: boolean;
}

/** Short holiday names that fit in a day square. */
const SHORT: Record<string, string> = {
  "New Year's Day": 'New Year',
  'Martin Luther King Jr. Day': 'MLK Day',
  "Presidents' Day": 'Pres. Day',
  'Memorial Day': 'Memo­rial',
  Juneteenth: 'June­teenth',
  'Independence Day': 'July 4th',
  'Labor Day': 'Labor Day',
  'Columbus Day': 'Colum­bus',
  'Veterans Day': 'Veter­ans',
  Thanksgiving: 'Thanks­giving',
  'Day after Thanksgiving': 'Day after',
  'Christmas Day': 'Christ­mas',
  'Rosh Hashanah': 'Rosh Hash.',
  'Rosh Hashanah (day 2)': 'Rosh Hash.',
  'Yom Kippur': 'Yom Kippur',
  Sukkot: 'Sukkot',
  'Sukkot (day 2)': 'Sukkot',
  'Shemini Atzeret': 'Shemini Atzeret',
  'Simchat Torah': 'Simchat Torah',
  Hanukkah: 'Hanuk­kah',
  Purim: 'Purim',
  Passover: 'Pass­over',
  'Passover (day 2)': 'Pass­over',
  'Passover (day 7)': 'Pass­over',
  'Passover (day 8)': 'Pass­over',
  Shavuot: 'Shavuot',
  'Shavuot (day 2)': 'Shavuot',
};
function shortHoliday(name: string): string {
  return SHORT[name] ?? (name.length > 14 ? `${name.slice(0, 12)}.` : name);
}

export function PlanView({
  household,
  today,
  update,
  onShowList,
}: {
  household: Household;
  today: ISODate;
  update: (fn: (h: Household) => Household) => void;
  onShowList: () => void;
}) {
  const units = household.units ?? 'hours';
  const me = household.members[0];
  const perDay = me.policy.hoursPerDay;
  const narrow = useNarrow();
  const t = partsOf(toDay(today));
  const first: Month = { y: t.y, m: t.m };
  const [month, setMonth] = useState<Month>(first);
  const [popped, setPopped] = useState<ISODate | null>(null);
  const [custom, setCustom] = useState<ISODate | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);

  const shown = useMemo(() => (narrow ? [month] : [0, 1, 2].map((i) => shiftMonth(month, i))), [month, narrow]);
  const views = useMemo(() => shown.map((mo) => ({ ...mo, ...viewDays(mo, narrow) })), [shown, narrow]);
  const lastShown = shown[shown.length - 1];

  const until = (() => {
    const a = addDays(today, 730);
    const b = addDays(`${lastShown.y}-${String(lastShown.m).padStart(2, '0')}-01`, 400);
    return a > b ? a : b;
  })();
  const opts: ForecastOptions = { from: today, until };

  const parts = useMemo(() => splitDaysOff(household.trips, me), [household.trips, me]);
  const daysOff = parts.pto;
  const sickDays = parts.sick;
  const forecast = useMemo(() => forecastMember(me, household.trips, opts), [household.trips, me, until]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only when sick time has its own balance; otherwise sick days are already in the PTO forecast.
  const sickForecast = useMemo(() => forecastSick(me, household.trips, opts), [household.trips, me, until]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paydays (and any other day PTO is added) from today on, with the balance right after.
  const paydays = useMemo(() => {
    const out = new Map<ISODate, number>();
    for (const e of forecast.events) if ((e.kind === 'accrual' || e.kind === 'capped') && e.date >= today) out.set(e.date, forecast.balanceOn(e.date));
    return out;
  }, [forecast, today]);

  const hol = useMemo(() => holidaySets([me], month.y - 1, month.y + 2).get(me.id), [me, month.y]);
  // Every labeled holiday, and whether the employer gives it off. Unpaid ones are ordinary workdays with a label.
  const holidayLabels = useMemo(() => {
    const paid = paidNames(me);
    const out = new Map<ISODate, DayHoliday>();
    for (const h of labeledHolidays(me, month.y - 1, month.y + 2)) {
      if (!out.has(h.date) || paid.has(h.base)) out.set(h.date, { name: h.name, base: h.base, group: h.group, paid: paid.has(h.base) });
    }
    for (const h of me.holidays) out.set(h.date, { name: h.name, base: h.name, group: 'own', paid: true });
    return out;
  }, [me, month.y]);

  const togglePaid = (base: string, paid: boolean) =>
    update((h) => ({
      ...h,
      members: h.members.map((m, i) => {
        if (i !== 0) return m;
        const names = paidNames(m);
        if (paid) names.add(base);
        else names.delete(base);
        return { ...m, paidHolidays: [...names] };
      }),
    }));

  const floor = -me.policy.allowNegative;

  // When the plan runs short: the worst point, and earlier time off (not itself short) whose removal would help there.
  const shortfall = useMemo(() => {
    const worst = worstShortfall(forecast, me, today);
    if (!worst) return null;
    const separate = !!me.sick?.separate;
    const helpers = household.trips
      .filter((t) => t.end >= today && t.start <= worst.date && !(t.sick && separate))
      .filter((t) => {
        const firstShort = overdrawnFrom(forecast, me, t.start);
        return firstShort === null || firstShort > t.end; // its own days aren't red
      })
      .map((t) => {
        const without = forecastMember(me, household.trips.filter((x) => x.id !== t.id), opts);
        return { trip: t, frees: without.balanceOn(worst.date) - forecast.balanceOn(worst.date) };
      })
      .filter((x) => x.frees > 0.05)
      .sort((a, b) => b.frees - a.frees)
      .slice(0, 3);
    return { ...worst, helpers };
  }, [forecast, household.trips, me, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: DaysOff, d: ISODate) => {
    const share = next.pto[d] ?? next.sick[d];
    if (share && (share !== (daysOff[d] ?? sickDays[d]) || !!next.sick[d] !== !!sickDays[d])) setPopped(d);
    update((h) => ({ ...h, trips: tripsFromSplit(next, me, () => newId('trip')) }));
  };
  const tap = (d: ISODate) => {
    if (held.current) {
      held.current = false; // the click that ends a long press
      return;
    }
    // A sick day clears on tap; anything else cycles full → half → working.
    save(sickDays[d] ? setDayKind(parts, d, 0, true) : { pto: cycleDay(daysOff, d), sick: sickDays }, d);
  };

  // Press and hold (touch) or right-click (mouse) opens the custom-hours menu.
  const startHold = (e: React.PointerEvent, d: ISODate) => {
    if (e.pointerType === 'mouse') return;
    held.current = false;
    const timer = setTimeout(() => {
      held.current = true;
      navigator.vibrate?.(10);
      setCustom(d);
    }, HOLD_MS);
    hold.current = { timer, x: e.clientX, y: e.clientY };
  };
  const moveHold = (e: React.PointerEvent) => {
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) endHold();
  };
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const totalOff = Object.entries(daysOff)
    .filter(([d]) => d >= today)
    .reduce((s, [, v]) => s + v, 0);
  const loss = nextLoss(forecast, today);
  const low = forecast.low;
  // Look back a year (to record sick days and other time already taken) and ahead two.
  const earliest = shiftMonth(first, -12);
  const atFirst = month.y === earliest.y && month.m === earliest.m;
  const jumpOptions = Array.from({ length: 36 }, (_, i) => shiftMonth(earliest, i));

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
    // Round big numbers, and negatives past −10, so the tag fits a narrow weekend column.
    const r = Math.abs(u) >= 100 || u <= -10 ? Math.round(u) : Math.round(u * 10) / 10;
    const s = (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('-', '−');
    return units === 'days' ? `${s}d` : `${s}h`;
  };

  return (
    <div className="plan">
      <header className="plan-head">
        <div className="plan-title">
          <h1>Plan days off</h1>
          <button type="button" className="link quiet" onClick={onShowList}>
            List view
          </button>
        </div>
        <p className="plan-banked">
          You have {amount(forecast.balanceOn(today), perDay, units)} banked today
          {sickForecast ? `, plus ${amount(sickForecast.balanceOn(today), perDay, units)} of sick time` : ''}.
        </p>
        {loss && loss.hours >= 0.5 ? (
          <p className="plan-loss">
            You forfeit {amount(loss.hours, perDay, units)} on {formatDate(loss.date, 'medium')} unless you use them first.
          </p>
        ) : null}
      </header>

      <section className="calendar" aria-label="Calendar" onTouchStart={narrow ? onTouchStart : undefined} onTouchEnd={narrow ? onTouchEnd : undefined}>
        <CorgiPeek />
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
                  const beforeStart = d <= me.startDate;
                  const work = isWorkday(me, n, hol);
                  const sickShare = sickDays[d];
                  const off = daysOff[d] ?? sickShare;
                  const isSick = !!sickShare;
                  const offHours = off ? Math.round(off * perDay * 100) / 100 : 0;
                  const kind = !off ? null : off === 1 ? 'full' : off === 0.5 ? 'half' : 'custom';
                  const hl = holidayLabels.get(d);
                  const paidHoliday = !!hl?.paid && !work && me.policy.workDays.includes(weekdayOf(n));
                  const payday = paydays.get(d);
                  const below = !!off && !past && (isSick && sickForecast ? sickForecast.balanceOn(d) < -1e-9 : forecast.balanceOn(d) < floor - 1e-9);
                  const cls = [
                    'cal-day',
                    adjacent ? 'adjacent' : '',
                    past ? 'past' : '',
                    !work ? 'weekend' : '',
                    paidHoliday ? 'holiday' : '',
                    kind ? `day-off ${kind}` : '',
                    isSick ? 'sick' : '',
                    below ? 'below' : '',
                    d === today ? 'today' : '',
                    beforeStart ? 'before-start' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const label = [
                    `${WEEKDAY_NAMES[weekdayOf(n)]}, ${formatDate(d, 'short')}`,
                    hl ? (paidHoliday ? `${hl.name}, paid holiday` : `${hl.name}, a workday`) : '',
                    kind === 'full' ? (isSick ? 'sick day' : 'day off') : kind === 'half' ? (isSick ? 'half sick day' : 'half day off') : kind === 'custom' ? `${offHours} hours ${isSick ? 'sick' : 'off'}` : '',
                    below ? (isSick && sickForecast ? 'more sick time than you have' : 'puts you below zero') : '',
                    off && beforeStart ? 'already counted in your starting balance' : '',
                    payday !== undefined ? `payday, ${amount(payday, perDay, units)} banked after` : '',
                  ]
                    .filter(Boolean)
                    .join('. ');
                  const tappable = work || paidHoliday;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={cls}
                      disabled={!tappable}
                      aria-label={label}
                      aria-pressed={tappable ? !!off : undefined}
                      aria-haspopup="dialog"
                      style={kind && kind !== 'full' ? ({ ['--fill' as string]: `${Math.round((off as number) * 100)}%` } as React.CSSProperties) : undefined}
                      onClick={() => (paidHoliday ? setCustom(d) : tap(d))}
                      onPointerDown={(e) => startHold(e, d)}
                      onPointerMove={moveHold}
                      onPointerUp={endHold}
                      onPointerCancel={endHold}
                      onPointerLeave={endHold}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!tappable) return;
                        endHold();
                        held.current = false;
                        setCustom(d);
                      }}
                    >
                      <span className="cal-num">
                        {adjacent && p.d === 1 ? <small>{MONTHS[p.m - 1].slice(0, 3)} </small> : null}
                        {p.d}
                      </span>
                      {hl ? (
                        <span className={`cal-holiday ${paidHoliday ? 'paid' : 'unpaid'} ${hl.group}`} aria-hidden="true">
                          {shortHoliday(hl.name)}
                        </span>
                      ) : null}
                      {kind ? (
                        <span className={`off-mark ${popped === d ? 'pop' : ''}`} onAnimationEnd={() => setPopped(null)}>
                          {isSick ? <Thermometer /> : kind === 'full' ? <BeachUmbrella /> : <Car />}
                          {kind === 'half' ? <span className="part-label">½</span> : null}
                          {kind === 'custom' ? <span className="part-label">{offHours}h</span> : null}
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
      </section>

      <div className={`plan-bar ${shortfall ? 'problem' : ''}`} aria-live="polite">
        {shortfall ? (
          <div className="shortfall">
            <p>
              <strong>
                You’d be {amount(shortfall.hours, perDay, units)} short by {formatDate(shortfall.date, 'medium')}.
              </strong>{' '}
              {shortfall.helpers.length > 0 ? 'Red days run out. Dropping earlier time off helps:' : 'Remove a red day or move it later.'}
            </p>
            {shortfall.helpers.length > 0 ? (
              <div className="chips">
                {shortfall.helpers.map(({ trip, frees }) => (
                  <button
                    key={trip.id}
                    type="button"
                    className="chip tiny"
                    onClick={() => {
                      const p = partsOf(toDay(trip.start));
                      setMonth({ y: p.y, m: p.m });
                    }}
                  >
                    {shortRange(trip.start, trip.end)} · {amount(frees, perDay, units)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : sickForecast?.firstOverdrawn ? (
          <p>
            <strong>
              You’d be {amount(Math.abs(sickForecast.balanceOn(sickForecast.firstOverdrawn)), perDay, units)} short of sick time on{' '}
              {formatDate(sickForecast.firstOverdrawn, 'medium')}.
            </strong>{' '}
            Change a red sick day to PTO, or remove it.
          </p>
        ) : totalOff > 0 ? (
          <p>
            <strong>{amount(totalOff * perDay, perDay, units)} off planned.</strong> Lowest point ahead: {amount(low.balance, perDay, units)} on{' '}
            {formatDate(low.date, 'short')}.
          </p>
        ) : (
          <p>
            Tap a workday to take it off, including past days like a sick day. Tap again for a half day, or{' '}
            {narrow ? 'press and hold' : 'right-click'} for other hours or a sick day. Green tags show your balance on paydays.
          </p>
        )}
      </div>

      {custom ? (
        <CustomHours
          date={custom}
          perDay={perDay}
          current={daysOff[custom] ?? sickDays[custom] ?? 0}
          sick={!!sickDays[custom]}
          sickSeparate={!!sickForecast}
          onKind={(sick) => {
            const share = daysOff[custom] ?? sickDays[custom];
            if (share) save(setDayKind(parts, custom, share, sick), custom);
          }}
          holiday={holidayLabels.get(custom)}
          onPaid={(paid) => {
            const h = holidayLabels.get(custom);
            if (h) togglePaid(h.base, paid);
          }}
          onClose={() => setCustom(null)}
          onSet={(hours, sick) => {
            save(setDayKind(parts, custom, hours / perDay, sick), custom);
            setCustom(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomHours({
  date,
  perDay,
  current,
  sick: initialSick,
  sickSeparate,
  holiday,
  onPaid,
  onKind,
  onSet,
  onClose,
}: {
  date: ISODate;
  perDay: number;
  current: number;
  sick: boolean;
  sickSeparate: boolean;
  holiday?: DayHoliday;
  onPaid: (paid: boolean) => void;
  onKind: (sick: boolean) => void;
  onSet: (hours: number, sick: boolean) => void;
  onClose: () => void;
}) {
  const [sick, setSick] = useState(initialSick);
  const set = (h: number) => onSet(h, sick);
  const now = Math.round(current * perDay * 100) / 100;
  const [value, setValue] = useState<string>(now && now !== perDay && now !== perDay / 2 ? String(now) : '');
  const picks = [1, 2, 3, 6].filter((h) => h < perDay && h !== perDay / 2);
  const typed = Number(value);
  const valid = value !== '' && typed > 0 && typed <= perDay;
  return (
    <Sheet open title={formatDate(date, 'long')} onClose={onClose}>
      {holiday && holiday.group !== 'own' ? (
        <label className="check holiday-paid">
          <input type="checkbox" checked={holiday.paid} onChange={(e) => onPaid(e.target.checked)} />
          <span>
            <strong>{holiday.base}</strong> is a paid day off at work, every year
            <small>{holiday.paid ? 'No PTO is used. Uncheck if you work this day.' : 'Check if your employer gives this day off; no PTO is used.'}</small>
          </span>
        </label>
      ) : null}
      {holiday?.paid ? (
        <p className="hint">{holiday.group === 'own' ? `${holiday.name} is one of your extra paid days off (Settings).` : 'This day is already off, so there is nothing to take.'}</p>
      ) : (
      <>
      <div className="field kind-toggle">
        <Segmented
          label="Counts as"
          value={sick ? 'sick' : 'pto'}
          options={[
            { value: 'pto', label: 'Time off' },
            { value: 'sick', label: 'Sick day' },
          ]}
          onChange={(v) => {
            setSick(v === 'sick');
            if (current > 0) onKind(v === 'sick');
          }}
        />
        {sick ? <p className="hint">{sickSeparate ? 'Comes out of your sick time.' : 'Comes out of your PTO. If you have separate sick time, set it up in Settings.'}</p> : null}
      </div>
      <div className="hours-grid">
        <button type="button" className={`hours-choice ${now === perDay ? 'on' : ''}`} onClick={() => set(perDay)}>
          {sick ? <Thermometer /> : <BeachUmbrella />}
          Full day ({perDay} h)
        </button>
        <button type="button" className={`hours-choice ${now === perDay / 2 ? 'on' : ''}`} onClick={() => set(perDay / 2)}>
          {sick ? <Thermometer /> : <Car />}
          Half day ({perDay / 2} h)
        </button>
      </div>
      <div className="field">
        <span className="label">Or a few hours</span>
        <div className="chips">
          {picks.map((h) => (
            <button key={h} type="button" className={`chip ${now === h ? 'on' : ''}`} onClick={() => set(h)}>
              {h} h
            </button>
          ))}
        </div>
      </div>
      <form
        className="row end"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) set(typed);
        }}
      >
        <label className="field">
          <span className="label">Any amount</span>
          <div className="with-suffix">
            <input
              id="custom-hours"
              type="number"
              inputMode="decimal"
              min={0.25}
              max={perDay}
              step={0.25}
              placeholder={`Up to ${perDay}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="suffix">h</span>
          </div>
        </label>
        <button type="submit" className="primary" disabled={!valid}>
          Set
        </button>
      </form>
      {value !== '' && !valid ? <p className="error">Enter between 0.25 and {perDay} hours.</p> : null}
      {current > 0 ? (
        <button type="button" className="danger" onClick={() => set(0)}>
          Clear this day
        </button>
      ) : null}
      </>
      )}
    </Sheet>
  );
}
