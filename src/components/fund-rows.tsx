// A list of made-up funds for All mutual funds, the collections and the watchlist: initials, name, sub-category,
// risk and fund size, with the 3Y return on the right (sign and colour, never colour alone). No star ratings.
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
          <Link href={`/fund/${f.id}`} aria-label={fundLinkLabel(f.name, f.return3y)} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-page">
            <Initials text={f.initials} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-strong">{f.name}</span>
              <span className="block text-sm text-muted">{f.about}</span>
              <span className="tabular block text-xs text-muted">{f.size}</span>
            </span>
            <span className="shrink-0 text-right text-sm">{f.return3y ? <Signed value={f.return3y} /> : <span className="text-muted">New</span>}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A fund link's name for screen readers: the fund and its 3Y return, such as "Banyan Flexi Cap Fund, 3Y return +18.2%". */
export function fundLinkLabel(name: string, return3y: string | null): string {
  return `${name}, 3Y return ${return3y ?? 'not yet available: new fund'}`;
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

