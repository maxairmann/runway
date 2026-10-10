import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, fromDay, partsOf, toDay, type ISODate } from '../engine/dates';
import type { MemberForecast } from '../engine/forecast';
import type { Household, Trip } from '../engine/types';
import { hours } from '../format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEPS = [1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 200, 400, 800];

interface Props {
  household: Household;
  forecasts: Record<string, MemberForecast>;
  /** Faint "before" lines, for previewing a change. */
  ghost?: Record<string, MemberForecast>;
  from: ISODate;
  until: ISODate;
  today: ISODate;
  trips: Trip[];
  /** Highlight this trip's band. */
  focusTripId?: string;
  height?: number;
  compact?: boolean;
}

function valueAt(f: MemberForecast | undefined, n: number): number | null {
  if (!f) return null;
  const i = n - f.startDay;
  if (i < 0 || i >= f.balances.length) return null;
  return f.balances[i];
}

export function BalanceChart({
  household,
  forecasts,
  ghost,
  from,
  until,
  today,
  trips,
  focusTripId,
  height = 260,
  compact = false,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x0 = toDay(from);
  const x1 = Math.max(toDay(until), x0 + 1);
  const pad = { l: 44, r: 14, t: compact ? 10 : 22, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const x = (n: number) => pad.l + ((n - x0) / (x1 - x0)) * plotW;

  const { yMin, yMax, ticks } = useMemo(() => {
    let lo = 0;
    let hi = 8;
    for (const m of household.members) {
      for (const set of [forecasts, ghost]) {
        const f = set?.[m.id];
        if (!f) continue;
        for (let n = x0; n <= x1; n++) {
          const v = valueAt(f, n);
          if (v === null) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      hi = Math.max(hi, m.buffer);
    }
    const step = STEPS.find((s) => (hi - lo) / s <= 4) ?? 1600;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil((hi * 1.04) / step) * step;
    const t: number[] = [];
    for (let v = min; v <= max + 1e-9; v += step) t.push(v);
    return { yMin: min, yMax: max, ticks: t };
  }, [household.members, forecasts, ghost, x0, x1]);

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
    const every = span > 500 ? 3 : span > 240 ? 2 : 1;
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
  }, [x0, x1]);

  const path = (f: MemberForecast | undefined) => {
    if (!f) return '';
    let d = '';
    for (let n = x0; n <= x1; n++) {
      const v = valueAt(f, n);
      if (v === null) continue;
      d += `${d ? 'L' : 'M'}${x(n).toFixed(1)} ${y(v).toFixed(1)}`;
    }
    return d;
  };

  const todayN = toDay(today);
  const visibleTrips = trips.filter((t) => toDay(t.end) >= x0 && toDay(t.start) <= x1);

  const summary = household.members
    .map((m) => {
      const f = forecasts[m.id];
      return f ? `${m.name}: lowest ${hours(f.low.balance)} on ${formatDate(f.low.date)}` : '';
    })
    .join('. ');

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px < pad.l || px > width - pad.r) return setHover(null);
    setHover(Math.round(x0 + ((px - pad.l) / plotW) * (x1 - x0)));
  };

  const hoverX = hover === null ? 0 : x(hover);
  const tipLeft = hover !== null && hoverX > width / 2;

  return (
    <div className="chart" ref={wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Balance forecast. ${summary}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
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
              {!compact && b - a > 44 ? (
                <text x={a + 4} y={pad.t - 6} className="band-label">
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
              y1={y(m.buffer)}
              y2={y(m.buffer)}
              stroke={m.color}
              strokeOpacity="0.55"
              strokeDasharray="3 5"
            />
          ) : null,
        )}

        {ghost
          ? household.members.map((m) => (
              <path
                key={`ghost-${m.id}`}
                d={path(ghost[m.id])}
                fill="none"
                stroke={m.color}
                strokeOpacity="0.35"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            ))
          : null}

        {household.members.map((m) => (
          <path key={m.id} d={path(forecasts[m.id])} fill="none" stroke={m.color} strokeWidth="2.25" strokeLinejoin="round" />
        ))}

        {household.members.map((m, i) => {
          const f = forecasts[m.id];
          if (!f) return null;
          const n = toDay(f.low.date);
          if (n < x0 || n > x1) return null;
          const cx = x(n);
          const cy = y(f.low.balance);
          const below = cy < pad.t + 30;
          const anchor = cx > width - 90 ? 'end' : cx < pad.l + 50 ? 'start' : 'middle';
          return (
            <g key={`low-${m.id}`} className="low-marker">
              <circle cx={cx} cy={cy} r="4.5" />
              {!compact ? (
                <text x={cx} y={below ? cy + 18 + i * 14 : cy - 10 - i * 14} textAnchor={anchor}>
                  {`${m.name} low ${hours(f.low.balance)}`}
                </text>
              ) : null}
            </g>
          );
        })}

        {hover !== null ? (
          <g className="hover">
            <line x1={hoverX} x2={hoverX} y1={pad.t} y2={pad.t + plotH} />
            {household.members.map((m) => {
              const v = valueAt(forecasts[m.id], hover);
              return v === null ? null : <circle key={m.id} cx={hoverX} cy={y(v)} r="3.5" fill={m.color} />;
            })}
          </g>
        ) : null}
      </svg>

      {hover !== null ? (
        <div
          className="chart-tip"
          style={tipLeft ? { right: width - hoverX + 10, top: pad.t } : { left: hoverX + 10, top: pad.t }}
        >
          <strong>{formatDate(fromDay(hover), 'long')}</strong>
          {household.members.map((m) => {
            const v = valueAt(forecasts[m.id], hover);
            return v === null ? null : (
              <span key={m.id}>
                <span className="dot" style={{ background: m.color }} aria-hidden="true" />
                {m.name} {hours(v)}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
