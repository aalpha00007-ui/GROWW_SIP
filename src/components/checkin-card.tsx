// An AI card (PRD F8-F10): the answer with its quality strip, or the declined or fallback card with
// the facts table and the official links. Every card says when its numbers are from.
import Link from 'next/link';
import type { CheckInCard } from '@/server/checkin-card';

export function CheckInCardView({ card }: { card: CheckInCard }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      {card.understood && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">What I understood:</span> {card.understood}
        </p>
      )}
      <p className={`whitespace-pre-line ${card.understood ? 'mt-3' : ''} ${card.outcome === 'answer' ? '' : 'font-semibold'}`}>{card.text}</p>

      {card.appLink && (
        <Link href={card.appLink.href} className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand underline">
          {card.appLink.label}
        </Link>
      )}

      {card.facts && (
        <dl className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
          {card.facts.map((line) => (
            <div key={line.label} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted">{line.label}</dt>
              <dd className="tabular text-right font-medium">{line.value}</dd>
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
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
                {link.label}
              </a>
            </span>
          ))}
        </p>
      )}

      {card.strip && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-xs font-semibold" aria-label="Quality checks">
          {card.strip.map((check) => (
            <li key={check.label} className={check.ok ? 'text-gain-ink' : 'text-loss-ink'}>
              <span aria-hidden="true">{check.ok ? '✓' : '✗'}</span> {check.label}
              <span className="sr-only">{check.ok ? ' (passed)' : ' (failed)'}</span>
            </li>
          ))}
          {card.confidence && <li className="text-muted">{card.confidence}</li>}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">{card.asOf}</p>
    </section>
  );
}
