// SIP basics: six short facts, word for word from the brief, with the official places to learn more.
import type { Metadata } from 'next';
import { OFFICIAL_LINKS } from '@/pipeline/retrieval/checkin';

export const metadata: Metadata = { title: 'SIP basics · Groww prototype' };

const FACTS = [
  "A SIP invests a fixed amount in a mutual fund on a set date, usually every month. Each instalment buys units at that day's NAV.",
  "A fund's NAV changes every business day with the value of what the fund holds, so a SIP's value goes up and down.",
  "When prices fall, the same instalment buys more units. This is called rupee cost averaging. It doesn't guarantee a profit or protect against losses.",
  'You can usually pause or stop a SIP. Stopping ends future instalments; the units you already hold stay invested until you redeem them.',
  'Tax-saver (ELSS) units are locked in for 3 years from the date of each instalment.',
  "Mutual fund investments are subject to market risks. Past returns don't guarantee future returns.",
];

export default function SipBasics() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 text-ink">
      <header>
        <h1 className="text-3xl font-bold">SIP basics</h1>
        <p className="mt-2 text-lg text-muted">Short facts on SIPs and market falls.</p>
      </header>
      <ol className="space-y-3">
        {FACTS.map((fact, i) => (
          <li key={i} className="flex gap-4 rounded-xl border border-line bg-surface p-5">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
              {i + 1}
            </span>
            <p>{fact}</p>
          </li>
        ))}
      </ol>
      <p>
        Learn more from official sources:{' '}
        {OFFICIAL_LINKS.map((link, i) => (
          <span key={link.url}>
            {i > 0 && ' and '}
            <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">
              {link.label}
            </a>
          </span>
        ))}
        .
      </p>
    </article>
  );
}
