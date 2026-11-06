// An AI card (PRD F8-F10): the answer with "How this answer was checked" folded under it, or the declined or
// fallback card with the facts table, the official links and the quality check that stopped the AI.
// Every card says when its prices are from.
import Link from 'next/link';
import type { CheckInCard } from '@/server/checkin-card';
import { toRupeeSign } from '@/server/money';
import { Signed } from './signed';

export function CheckInCardView({ card }: { card: CheckInCard }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      {card.understood && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">What I understood:</span> <span lang={card.lang}>{card.understood}</span>
        </p>
      )}
      <p lang={card.lang} className={`whitespace-pre-line ${card.understood ? 'mt-3' : ''} ${card.outcome === 'answer' ? '' : 'font-semibold'}`}>
        {toRupeeSign(card.text)}
      </p>
      {/* Right under the text, so it is seen before the facts. */}
      {card.gate && <p className="mt-3 rounded-lg bg-page px-3 py-2 text-xs font-semibold text-ink">{card.gate}</p>}

      {card.appLink && (
        <Link href={card.appLink.href} className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline">
          {card.appLink.label}
        </Link>
      )}

      {card.facts && (
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
          {card.facts.map((line) => (
            <div key={line.label} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted">{line.label}</dt>
              <dd className="tabular text-right font-medium">{/^[+-]/.test(line.value) ? <Signed value={toRupeeSign(line.value)} /> : toRupeeSign(line.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.links && (
        <p className="mt-3 text-sm">
          Learn more from official sources:{' '}
          {card.links.map((link, i) => (
            <span key={link.url}>
              {i > 0 && ' and '}
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                {link.label}
              </a>
            </span>
          ))}
        </p>
      )}

      {card.checked && (
        <details className="mt-3 border-t border-line pt-1 text-sm" lang={card.lang}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary underline underline-offset-2">{card.checked.summary}</summary>
          <ul className="space-y-1 pb-1 text-xs text-muted" aria-label="Quality checks">
            {card.checked.items.map((check) => (
              <li key={check.label}>
                <span aria-hidden="true">{check.ok ? '·' : '✗'}</span> {check.label}
                {!check.ok && <span className="sr-only"> (failed)</span>}
              </li>
            ))}
          </ul>
          <p className="pb-1 text-xs text-muted">{card.checked.note}</p>
        </details>
      )}
      <p className="mt-2 text-xs text-muted">{card.asOf}</p>
    </section>
  );
}
