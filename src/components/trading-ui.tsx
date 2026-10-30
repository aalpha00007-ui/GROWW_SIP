// Small pieces for the display-only Stocks and F&O pages: the disabled Buy/Sell pair with its tooltip, a
// mini candlestick chart, a plain table and the bond rating dot. Our own SVG; colour never stands alone.
import type { Candle } from '@/server/trading';

export const DEMO_ONLY = 'Demo only. This case study covers mutual fund SIPs.';

/**
 * Buy and Sell that do nothing: hover or focus shows why. `id` keeps each tooltip's id unique on the page;
 * `align` is the side the tooltip lines up with ('start' on a card, 'end' at the end of a row).
 */
export function DemoTrade({ id, align = 'start' }: { id: string; align?: 'start' | 'end' }) {
  return (
    <span className="group relative inline-flex gap-1.5">
      {['Buy', 'Sell'].map((label) => (
        <button
          key={label}
          type="button"
          aria-disabled="true"
          aria-describedby={`demo-tip-${id}`}
          title={DEMO_ONLY}
          className="min-h-9 cursor-not-allowed rounded-md border border-line px-3 text-xs font-semibold text-muted"
        >
          {label}
        </button>
      ))}
      <span
        id={`demo-tip-${id}`}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full ${align === 'end' ? 'right-0' : 'left-0'} z-10 mb-1.5 hidden w-56 rounded-md bg-strong px-2.5 py-1.5 text-xs text-white shadow group-focus-within:block group-hover:block`}
      >
        {DEMO_ONLY}
      </span>
    </span>
  );
}

/** Daily candles: a green body when the day closed up, a red one when it closed down. */
export function Candles({ candles, label }: { candles: Candle[]; label: string }) {
  const W = 120;
  const H = 48;
  const high = Math.max(...candles.map((k) => k.h));
  const low = Math.min(...candles.map((k) => k.l));
  const y = (v: number) => (high === low ? H / 2 : 2 + ((high - v) / (high - low)) * (H - 4));
  const step = W / candles.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-12 w-full">
      {candles.map((k, i) => {
        const up = k.c >= k.o;
        const x = i * step + step / 2;
        const top = y(Math.max(k.o, k.c));
        return (
          <g key={i} className={up ? 'fill-gain stroke-gain' : 'fill-loss stroke-loss'}>
            <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={x - step * 0.3} y={top} width={step * 0.6} height={Math.max(0.8, y(Math.min(k.o, k.c)) - top)} />
          </g>
        );
      })}
    </svg>
  );
}

const DOT = { high: 'bg-gain', mid: 'bg-accent', low: 'bg-loss' } as const;

export function Rating({ rating, level }: { rating: string; level: keyof typeof DOT }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-strong">
      <span className={`size-2 rounded-full ${DOT[level]}`} aria-hidden="true" />
      {rating}
    </span>
  );
}

/** An empty Holdings, Positions, Orders or Watchlist: what a new demo account sees. */
export function NoRows({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 text-center">
      <p className="font-medium text-strong">{title}</p>
      <p className="mt-1 text-sm text-muted">{DEMO_ONLY}</p>
    </div>
  );
}

/** A table that scrolls sideways inside its card on phones; the page never does. */
export function DataTable({ head, rows, note }: { head: { label: string; right?: boolean }[]; rows: React.ReactNode[][]; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      {/* relative: keeps the screen-reader-only words inside the scroll box, so the page never scrolls sideways. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              {head.map((h) => (
                <th key={h.label} scope="col" className={`px-4 py-2.5 font-semibold ${h.right ? 'text-right' : ''}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((cell, j) => (
                  <td key={j} className={`tabular px-4 py-3 ${head[j]?.right ? 'text-right' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
