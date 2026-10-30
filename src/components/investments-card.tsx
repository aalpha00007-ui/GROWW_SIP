// "Your investments" on Explore and the Dashboard: current value with the goals it is for, then 1D returns,
// total returns, invested and XIRR. An empty state with our own drawing before anything is invested.
import Link from 'next/link';
import type { InvestmentsView } from '@/server/investments';
import { Icon } from './icons';
import { SectionTitle } from './section-title';
import { Signed } from './signed';

export function InvestmentsCard({ view, link }: { view: InvestmentsView | null; link?: { label: string; href: string } }) {
  return (
    <section>
      <SectionTitle title="Your investments" link={view ? link : undefined} />
      {view ? (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">Current value</p>
          <p className="tabular mt-0.5 text-[28px] font-bold leading-tight text-strong">{view.current}</p>
          {view.goals.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-sm font-medium text-primary">
              {view.goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          )}
          <dl className="mt-4 divide-y divide-line border-t border-line">
            {view.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <dt className="text-muted">{row.label}</dt>
                <dd className="tabular text-right font-medium text-strong">{row.signed ? <Signed value={row.value} /> : row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">{view.asOf} · Demo data</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-5 text-center">
          <EmptyInvestments />
          <p className="mt-3 font-medium text-strong">You haven&apos;t invested yet</p>
          <p className="mt-1 text-sm text-muted">Start a SIP in a made-up fund and tell us what it is for.</p>
          <Link
            href="/funds"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Explore funds
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}

/** Our own small line drawing for "You haven't invested yet": a seedling in a pot. */
export function EmptyInvestments() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mx-auto">
      <path d="M34 50h28l-4 18H38z" className="stroke-muted" />
      <path d="M30 50h36" className="stroke-muted" />
      <path d="M48 50V28" className="stroke-primary" />
      <path d="M48 36c-10 0-15-6-15-14 9 0 15 5 15 14Z" className="stroke-primary" />
      <path d="M48 30c0-9 6-15 16-15 0 9-6 15-16 15Z" className="stroke-primary" />
    </svg>
  );
}
