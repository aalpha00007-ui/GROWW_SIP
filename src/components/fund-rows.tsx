// A list of made-up funds for All mutual funds and the collections: initials, name, sub-category and risk,
// rating and fund size, with the 3Y return on the right (sign and colour, never colour alone).
import Link from 'next/link';
import type { FundCard } from '@/server/funds';
import { Signed } from './signed';

export function FundRows({ funds }: { funds: FundCard[] }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      <li className="flex justify-between gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted" aria-hidden="true">
        <span>Fund</span>
        <span>3Y return</span>
      </li>
      {funds.map((f) => (
        <li key={f.id}>
          <Link href={`/fund/${f.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-page">
            <Initials text={f.initials} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-strong">{f.name}</span>
              <span className="block text-sm text-muted">{f.about}</span>
              <span className="tabular block text-xs text-muted">
                <Stars count={f.rating} /> · {f.size}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm">{f.return3y ? <Signed value={f.return3y} /> : <span className="text-muted">New</span>}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The made-up fund's initials in a bordered tile: our stand-in for a fund house logo. */
export function Initials({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-lg border border-line bg-surface font-semibold text-strong ${size === 'lg' ? 'size-14 text-lg' : 'size-11 text-sm'}`}
    >
      {text}
    </span>
  );
}

/** '★★★★☆' with the number for screen readers. */
export function Stars({ count }: { count: number }) {
  return (
    <span>
      <span aria-hidden="true" className="text-accent">
        {'★'.repeat(count)}
        <span className="text-line">{'★'.repeat(5 - count)}</span>
      </span>
      <span className="sr-only">Rated {count} of 5</span>
    </span>
  );
}
