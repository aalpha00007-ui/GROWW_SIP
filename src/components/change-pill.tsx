// A change vs what was put in. Never colour alone: an arrow and a + or − sign too (build spec §3).
// Down uses the darker red on the light red pill, so the text keeps 4.5:1 contrast.
import type { Change } from '@/server/home';
import { minusSign } from './signed';

const STYLE = {
  up: { pill: 'bg-primary-soft text-gain', arrow: '▲', word: 'Up' },
  down: { pill: 'bg-loss-soft text-loss-strong', arrow: '▼', word: 'Down' },
  flat: { pill: 'bg-page text-muted', arrow: '–', word: 'No change' },
} as const;

export function ChangePill({ change }: { change: Change }) {
  const style = STYLE[change.direction];
  return (
    <span className={`tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium ${style.pill}`}>
      <span aria-hidden="true" className="text-[10px]">
        {style.arrow}
      </span>
      <span className="sr-only">{style.word}</span>
      {minusSign(change.text)}
    </span>
  );
}
