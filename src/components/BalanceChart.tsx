import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatRange, fromDay, partsOf, toDay, weekdayOf, type ISODate } from '../engine/dates';
import type { MemberForecast } from '../engine/forecast';
import type { Household, Trip, Units } from '../engine/types';
import { amount, toUnits } from '../format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEPS = [0.5, 1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 200, 400, 800];
const HOLD_MS = 350;

export interface DayRange {
  start: ISODate;
  end: ISODate;
}

interface Props {
  household: Household;
  forecasts: Record<string, MemberForecast>;
  /** Faint "before" lines, for previewing a change. */
  ghost?: Record<string, MemberForecast>;
  from: ISODate;
  until: ISODate;
  today: ISODate;
  trips: Trip[];
  units: Units;
  /** Highlight this trip's band. */
  focusTripId?: string;
  /** Fixed height; omit to fill the parent's height. */
  height?: number;
  compact?: boolean;
  /** Called while a range is being dragged (null when the drag ends or is cancelled). */
  onDraftRange?: (r: DayRange | null) => void;
  /** Called when a drag finishes on a range. */
  onSelectRange?: (r: DayRange) => void;
}

function valueAt(f: MemberForecast | undefined, n: number): number | null {
  if (!f) return null;
  const i = n - f.startDay;
  if (i < 0 || i >= f.balances.length) return null;
  return f.balances[i];
}

function weekdaysBetween(a: number, b: number): number {
  let c = 0;
  for (let n = a; n <= b; n++) {
    const wd = weekdayOf(n);
    if (wd !== 0 && wd !== 6) c++;
  }
  return c;
}

export function BalanceChart({
  household,
  forecasts,
  ghost,
  from,
  until,
  today,
  trips,
  units,
  focusTripId,
  height: fixedHeight,
  compact = false,
  onDraftRange,
  onSelectRange,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: fixedHeight ?? 320 });
  const [hover, setHover] = useState<number | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const press = useRef<{
    id: number;
    day: number;
    x: number;
    y: number;
    type: string;
    active: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const interactive = Boolean(onSelectRange);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(280, Math.round(entry.contentRect.width));
      const h = fixedHeight ?? Math.max(220, Math.round(entry.contentRect.height));
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedHeight]);

  const width = size.w;
  const height = fixedHeight ?? size.h;
  const x0 = toDay(from);
  const x1 = Math.max(toDay(until), x0 + 1);
  const pad = { l: 40, r: 14, t: compact ? 12 : 26, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (n: number) => pad.l + ((n - x0) / (x1 - x0)) * plotW;
  const perDay = (id: string) => household.members.find((m) => m.id === id)?.policy.hoursPerDay ?? 8;
  const conv = (id: string, h: number) => toUnits(h, perDay(id), units);

  const { yMin, yMax, ticks } = useMemo(() => {
    let lo = 0;
    let hi = units === 'days' ? 1 : 8;
    for (const m of household.members) {
      for (const set of [forecasts, ghost]) {
        const f = set?.[m.id];
        if (!f) continue;
        for (let n = x0; n <= x1; n++) {
          const v = valueAt(f, n);
          if (v === null) continue;
          const u = toUnits(v, m.policy.hoursPerDay, units);
          if (u < lo) lo = u;
          if (u > hi) hi = u;
        }
      }
      hi = Math.max(hi, toUnits(m.buffer, m.policy.hoursPerDay, units));
    }
    const step = STEPS.find((s) => (hi - lo) / s <= 5) ?? 1600;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil((hi * 1.04) / step) * step;
    const t: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) t.push(Math.round(v * 100) / 100);
    return { yMin: min, yMax: max, ticks: t };
  }, [household.members, forecasts, ghost, x0, x1, units]);

  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const months = useMemo(() => {
    const out: { n: number; label: string }[] = [];
    const s = partsOf(x0);
    let yr = s.y;
    let mo = s.m + 1;
    if (mo > 12) {
      mo = 1;
      yr++;
    }
    const span = x1 - x0;
    const pxPerMonth = (plotW / span) * 30.4;
    const every = pxPerMonth > 44 ? 1 : pxPerMonth > 22 ? 2 : pxPerMonth > 14 ? 3 : 6;
    let i = 0;
    for (;;) {
      const n = toDay(`${yr}-${String(mo).padStart(2, '0')}-01`);
      if (n > x1) break;
      if (i % every === 0) out.push({ n, label: mo === 1 ? `${MONTHS[0]} ${yr}` : MONTHS[mo - 1] });
      i++;
      mo++;
      if (mo > 12) {
        mo = 1;
        yr++;
      }
    }
    return out;
  }, [x0, x1, plotW]);

  const path = (id: string, f: MemberForecast | undefined) => {
    if (!f) return '';
    let d = '';
    for (let n = x0; n <= x1; n++) {
      const v = valueAt(f, n);
      if (v === null) continue;
      d += `${d ? 'L' : 'M'}${x(n).toFixed(1)} ${y(conv(id, v)).toFixed(1)}`;
    }
    return d;
  };

  const todayN = toDay(today);
  const visibleTrips = trips.filter((t) => toDay(t.end) >= x0 && toDay(t.start) <= x1);
  const solo = household.members.length === 1;

  const summary = household.members
    .map((m) => {
      const f = forecasts[m.id];
      return f ? `${solo ? 'Lowest' : `${m.name}: lowest`} ${amount(f.low.balance, m.policy.hoursPerDay, units)} on ${formatDate(f.low.date)}` : '';
    })
    .join('. ');

  // Pointer handling: tap or move to inspect a day; hold then drag (touch) or drag (mouse) to pick a range.
  const dayAt = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(Math.max(px, pad.l), width - pad.r);
    return Math.round(x0 + ((clamped - pad.l) / plotW) * (x1 - x0));
  };

  const startSelection = () => {
    const p = press.current;
    if (!p) return;
    p.active = true;
    setSel({ a: p.day, b: p.day });
    onDraftRange?.({ start: fromDay(p.day), end: fromDay(p.day) });
    if (p.type !== 'mouse') navigator.vibrate?.(12);
  };

  const cancelPress = () => {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.active) onDraftRange?.(null);
    press.current = null;
    setSel(null);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const day = dayAt(e.clientX, rect);
    setHover(day);
    if (!interactive || e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic or already-released pointers; dragging still works without it.
    }
    press.current = { id: e.pointerId, day, x: e.clientX, y: e.clientY, type: e.pointerType, active: false, timer: null };
    if (e.pointerType !== 'mouse') press.current.timer = setTimeout(startSelection, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const day = dayAt(e.clientX, rect);
    const p = press.current;
    if (p && p.id === e.pointerId) {
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.active) {
        if (p.type === 'mouse' && moved > 4) startSelection();
        else if (p.type !== 'mouse' && moved > 10 && p.timer) {
          // Moved before the hold finished: treat as inspecting, not selecting.
          clearTimeout(p.timer);
          p.timer = null;
        }
      }
      if (p.active) {
        const a = Math.min(p.day, day);
        const b = Math.max(p.day, day);
        setSel((s) => (s && s.a === a && s.b === b ? s : { a, b }));
        onDraftRange?.({ start: fromDay(a), end: fromDay(b) });
        setHover(null);
        return;
      }
    }
    setHover(day);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    if (p && p.active && sel) {
      onSelectRange?.({ start: fromDay(sel.a), end: fromDay(sel.b) });
      press.current = null;
      setSel(null);
      return;
    }
    press.current = null;
    if (e.pointerType === 'mouse') return; // keep hovering
  };

  const hoverX = hover === null ? 0 : x(hover);
  const tipLeft = hover !== null && hoverX > width / 2;

  return (
    <div className={`chart ${interactive ? 'interactive' : ''} ${fixedHeight ? '' : 'fill'}`} ref={wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Balance forecast. ${summary}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelPress}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !press.current?.active) setHover(null);
        }}
      >
        <defs>
          <pattern id="tentative-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink)" strokeOpacity="0.14" strokeWidth="2" />
          </pattern>
        </defs>

        {visibleTrips.map((t) => {
          const a = x(Math.max(toDay(t.start), x0));
          const b = x(Math.min(toDay(t.end) + 1, x1));
          const focus = t.id === focusTripId;
          return (
            <g key={t.id} className="trip-band">
              <rect
                x={a}
                y={pad.t}
                width={Math.max(2, b - a)}
                height={plotH}
                fill={t.status === 'tentative' ? 'url(#tentative-hatch)' : 'var(--ink)'}
                fillOpacity={t.status === 'tentative' ? 1 : focus ? 0.16 : 0.07}
                stroke={focus ? 'var(--amber)' : 'none'}
              />
              {!compact && b - a > 48 ? (
                <text x={a + 4} y={pad.t - 8} className="band-label">
                  {t.title.length > 18 ? `${t.title.slice(0, 17)}…` : t.title}
                </text>
              ) : null}
            </g>
          );
        })}

        <g className="grid">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : ''} />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          <text x={pad.l - 6} y={pad.t - 10} textAnchor="end" className="unit-label">
            {units}
          </text>
          {months.map((m) => (
            <text key={m.n} x={x(m.n)} y={height - 8} textAnchor="middle">
              {m.label}
            </text>
          ))}
        </g>

        {todayN >= x0 && todayN <= x1 ? (
          <g className="today">
            <line x1={x(todayN)} x2={x(todayN)} y1={pad.t} y2={pad.t + plotH} />
            {!compact ? (
              <text x={x(todayN) + 4} y={pad.t + 12}>
                Today
              </text>
            ) : null}
          </g>
        ) : null}

        {household.members.map((m) =>
          m.buffer > 0 ? (
            <line
              key={`buf-${m.id}`}
              x1={pad.l}
              x2={width - pad.r}
              y1={y(conv(m.id, m.buffer))}
              y2={y(conv(m.id, m.buffer))}
              stroke={m.color}
              strokeOpacity="0.55"
              strokeDasharray="3 5"
            />
          ) : null,
        )}

        {sel ? (
          <rect
            className="selection"
            x={x(sel.a)}
            y={pad.t}
            width={Math.max(3, x(sel.b + 1) - x(sel.a))}
            height={plotH}
          />
        ) : null}

        {ghost
          ? household.members.map((m) => (
              <path
                key={`ghost-${m.id}`}
                d={path(m.id, ghost[m.id])}
                fill="none"
                stroke={m.color}
                strokeOpacity="0.35"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            ))
          : null}

        {household.members.map((m) => (
          <path key={m.id} d={path(m.id, forecasts[m.id])} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinejoin="round" />
        ))}

        {!sel
          ? household.members.map((m, i) => {
              const f = forecasts[m.id];
              if (!f) return null;
              const n = toDay(f.low.date);
              if (n < x0 || n > x1) return null;
              const cx = x(n);
              const cy = y(conv(m.id, f.low.balance));
              const below = cy < pad.t + 34;
              const anchor = cx > width - 100 ? 'end' : cx < pad.l + 60 ? 'start' : 'middle';
              return (
                <g key={`low-${m.id}`} className="low-marker">
                  <circle cx={cx} cy={cy} r="4.5" />
                  {!compact ? (
                    <text x={cx} y={below ? cy + 20 + i * 15 : cy - 11 - i * 15} textAnchor={anchor}>
                      {`${solo ? 'Low' : `${m.name} low`} ${amount(f.low.balance, m.policy.hoursPerDay, units)}`}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}

        {hover !== null && !sel ? (
          <g className="hover">
            <line x1={hoverX} x2={hoverX} y1={pad.t} y2={pad.t + plotH} />
            {household.members.map((m) => {
              const v = valueAt(forecasts[m.id], hover);
              return v === null ? null : <circle key={m.id} cx={hoverX} cy={y(conv(m.id, v))} r="3.5" fill={m.color} />;
            })}
          </g>
        ) : null}
      </svg>

      {sel ? (
        <div className="chart-tip selecting" style={{ left: Math.min(Math.max(x(sel.a), 8), width - 190), top: pad.t + 4 }}>
          <strong>{formatRange(fromDay(sel.a), fromDay(sel.b))}</strong>
          <span>
            {weekdaysBetween(sel.a, sel.b)} {weekdaysBetween(sel.a, sel.b) === 1 ? 'workday' : 'workdays'}
          </span>
        </div>
      ) : hover !== null ? (
        <div className="chart-tip" style={tipLeft ? { right: width - hoverX + 10, top: pad.t } : { left: hoverX + 10, top: pad.t }}>
          <strong>{formatDate(fromDay(hover), 'long')}</strong>
          {household.members.map((m) => {
            const v = valueAt(forecasts[m.id], hover);
            return v === null ? null : (
              <span key={m.id}>
                {solo ? null : <span className="dot" style={{ background: m.color }} aria-hidden="true" />}
                {solo ? '' : `${m.name} `}
                {amount(v, m.policy.hoursPerDay, units)}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
