'use client';
// The fund page's NAV chart: made-up history with range chips 1M · 6M · 1Y · 3Y · 5Y · All. The line is
// green when the NAV is up over the range and red when it is down, and the change shows with its sign too.
import { useMemo, useState } from 'react';
import { percent } from '@/pipeline/chunking/format';
import { Signed } from './signed';

const RANGES = [
  { key: '1M', months: 1 },
  { key: '6M', months: 6 },
  { key: '1Y', months: 12 },
  { key: '3Y', months: 36 },
  { key: '5Y', months: 60 },
  { key: 'All', months: null },
] as const;

const W = 600;
const H = 200;
/** Enough points for a smooth line at any width, few enough to draw fast. */
const MAX_POINTS = 260;
const NAV = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function NavChart({ points }: { points: [string, number][] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('1Y');
  const [hover, setHover] = useState<number | null>(null);

  const shown = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)!.months;
    const last = points[points.length - 1][0];
    const inRange = months === null ? points : points.filter(([d]) => d >= monthsBefore(last, months));
    if (inRange.length <= MAX_POINTS) return inRange;
    // Thin evenly, always keeping the latest point.
    const step = inRange.length / MAX_POINTS;
    const thinned = Array.from({ length: MAX_POINTS - 1 }, (_, i) => inRange[Math.floor(i * step)]);
    return [...thinned, inRange[inRange.length - 1]];
  }, [points, range]);

  const values = shown.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (shown.length === 1 ? W : (i / (shown.length - 1)) * W);
  const y = (v: number) => (max === min ? H / 2 : H - 8 - ((v - min) / (max - min)) * (H - 16));
  const line = shown.map(([, v], i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const first = shown[0];
  const last = shown[shown.length - 1];
  const up = last[1] >= first[1];
  const change = percent((last[1] / first[1] - 1) * 100, true);
  const focus = hover === null ? null : shown[hover];

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover(Math.round(ratio * (shown.length - 1)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          <Signed value={change} /> <span className="ml-1">{range === 'All' ? 'since the start' : `in ${range}`}</span>
        </p>
        <p className="tabular text-sm text-muted" aria-live="polite">
          {focus ? `₹${NAV.format(focus[1])} on ${day(focus[0])}` : `${day(first[0])} to ${day(last[0])}`}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`NAV ${up ? 'up' : 'down'} ${change} from ₹${NAV.format(first[1])} on ${day(first[0])} to ₹${NAV.format(last[1])} on ${day(last[0])}. Demo data.`}
        className="mt-2 h-48 w-full touch-none sm:h-56"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <polyline points={line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className={up ? 'stroke-gain' : 'stroke-loss'} />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-line" />
            <circle cx={x(hover)} cy={y(shown[hover][1])} r="4" className={up ? 'fill-gain' : 'fill-loss'} />
          </>
        )}
      </svg>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`min-h-9 min-w-12 rounded-full border px-3 text-sm font-medium ${range === r.key ? 'border-strong bg-strong text-white' : 'border-line text-muted hover:border-primary hover:text-ink'}`}
          >
            {r.key}
          </button>
        ))}
      </div>
    </div>
  );
}
