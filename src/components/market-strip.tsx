// The market strip under the header: made-up index levels that move with the demo funds (server/market.ts),
// always labelled demo. One row that scrolls sideways on small screens; the page itself never does.
import type { MarketStrip as Strip } from '@/server/market';
import { Signed } from './signed';

export function MarketStrip({ strip }: { strip: Strip }) {
  return (
    <div className="border-b border-line bg-surface">
      {/* relative: keeps the screen-reader-only words inside the scroll area, so the page never scrolls sideways. */}
      <div
        className="relative mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto whitespace-nowrap px-4 py-2.5 text-sm [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        aria-label="Demo market indices"
      >
        <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Demo</span>
        {strip.indices.map((index) => (
          <span key={index.name} className="tabular flex items-baseline gap-2">
            <span className="font-medium text-strong">{index.name}</span>
            <span className="text-ink">{index.value}</span>
            {index.change && <Signed value={index.change} />}
          </span>
        ))}
        <span className="text-muted">{strip.note}</span>
      </div>
    </div>
  );
}
