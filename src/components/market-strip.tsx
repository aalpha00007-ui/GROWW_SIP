// The demo market strip: made-up index levels that move with the demo funds (server/market.ts), always
// labelled demo. It drifts slowly sideways and pauses on hover; with reduced motion it stays still and
// scrolls by hand. The page itself never scrolls sideways.
import type { MarketStrip as Strip } from '@/server/market';
import { Signed } from './signed';

function Items({ strip }: { strip: Strip }) {
  return (
    <>
      {strip.indices.map((index) => (
        <span key={index.name} className="tabular flex shrink-0 items-baseline gap-2">
          <span className="font-medium text-strong">{index.name}</span>
          <span className="text-ink">{index.value}</span>
          {index.change && <Signed value={index.change} />}
        </span>
      ))}
      <span className="shrink-0 text-muted">{strip.note}</span>
    </>
  );
}

export function MarketStrip({ strip }: { strip: Strip }) {
  return (
    <div className="border-b border-line bg-surface">
      {/* relative: keeps the screen-reader-only words inside, so the page never scrolls sideways. */}
      <div className="relative mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 text-sm">
        <span className="shrink-0 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Demo</span>
        <div
          className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap motion-reduce:overflow-x-auto motion-reduce:[scrollbar-width:thin]"
          aria-label="Demo market indices"
        >
          <div className="marquee flex w-max gap-6 hover:[animation-play-state:paused] motion-reduce:animate-none">
            <Items strip={strip} />
            {/* A second copy makes the loop seamless; screen readers hear the list once. */}
            <span aria-hidden="true" className="flex gap-6 motion-reduce:hidden">
              <Items strip={strip} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
