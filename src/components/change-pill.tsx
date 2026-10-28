// A change vs what was put in. Never colour alone: an arrow and a + or - sign too (build spec §3).
import type { Change } from '@/server/home';

const STYLE = {
  up: { pill: 'bg-gain-tint text-gain-ink', arrow: '▲', word: 'Up' },
  down: { pill: 'bg-loss-tint text-loss-ink', arrow: '▼', word: 'Down' },
  flat: { pill: 'bg-ground text-muted', arrow: '–', word: 'No change' },
} as const;

export function ChangePill({ change }: { change: Change }) {
  const style = STYLE[change.direction];
  return (
    <span className={`tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-semibold ${style.pill}`}>
      <span aria-hidden="true" className="text-[10px]">
        {style.arrow}
      </span>
      <span className="sr-only">{style.word}</span>
      {change.text}
    </span>
  );
}
