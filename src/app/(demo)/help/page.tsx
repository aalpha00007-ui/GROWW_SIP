// Help & about this prototype: what it is, what is made up, and where to learn more (SEBI, AMFI).
import Link from 'next/link';

const FAQ = [
  ['Is any of this real?', 'No. The funds, prices, people and balances are made up, no money moves, and nothing here is investment advice.'],
  ['What is a demo account?', 'A display name, a username and a made-up 4-digit PIN. We never ask for an email, phone, bank or ID detail.'],
  ['What does the goal on a SIP do?', 'When the market falls and a SIP looks red, we show its goal and your own numbers next to it, so you can decide calmly.'],
  ['What does the AI do?', 'At "Before you stop" and "What does this dip mean for my goal?" it explains your own SIP numbers. It never recommends a fund or says what to do.'],
  ['Does stopping a SIP take my money back?', 'No. Stopping ends future instalments; the units you bought stay invested until you redeem them.'],
  ['How do I delete my data?', 'Settings → Delete my demo account deletes it and everything in it.'],
];

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Help & about this prototype</h1>
      <p className="text-muted">
        GROWW_SIP is a student case-study prototype about first-year SIP investors who stop after a market fall. It is not made by or affiliated
        with Groww.
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {FAQ.map(([q, a]) => (
          <li key={q} className="p-5">
            <h2 className="text-base font-semibold">{q}</h2>
            <p className="mt-1 text-sm text-ink">{a}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Learn more from official sources:{' '}
        <a href="https://investor.sebi.gov.in/index.html" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
          SEBI Investor Website
        </a>{' '}
        and{' '}
        <a href="https://www.amfiindia.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
          AMFI
        </a>
        . See also the{' '}
        <Link href="/quality" className="font-semibold text-primary underline">
          quality page
        </Link>
        .
      </p>
    </div>
  );
}
