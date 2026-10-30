// The fund page, after the layout reference. Left: name and chips, the NAV chart with its ranges, the stats
// row, the return calculator and the fund facts. Right: the order card with the goal row (PRD F2), which
// stays in view from 1024px. Every fund and number is made up.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Initials, Stars } from '@/components/fund-rows';
import { NavChart } from '@/components/nav-chart';
import { OrderCard } from '@/components/order-card';
import { ReturnCalculator } from '@/components/return-calculator';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { idParam } from '@/server/api';
import { fundPage } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export default async function FundPage({ params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const fund = await fundPage(getDb(), visitor.id, await idParam(params), todayInIndia());
  if (!fund) notFound();

  return (
    <div className="space-y-4">
      <Link href="/funds" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-hover">
        ← All mutual funds
      </Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section>
            <Initials text={fund.initials} size="lg" />
            <h1 className="mt-3 text-2xl font-bold">{fund.name}</h1>
            <ul className="mt-2 flex flex-wrap gap-2">
              {fund.chips.map((chip) => (
                <li key={chip} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
                  {chip}
                </li>
              ))}
              <li className="rounded-full bg-accent-tint px-3 py-1 text-sm font-medium text-accent-ink">Simulated</li>
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            <p className="tabular text-2xl font-bold text-strong">{fund.nav}</p>
            <p className="text-sm text-muted">{fund.navDate} · Demo data</p>
            <div className="mt-3">
              <NavChart points={fund.chart} />
            </div>
          </section>

          <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3 xl:grid-cols-5">
            {fund.stats.map((s) => (
              <div key={s.label}>
                <dt className="text-sm text-muted">{s.label}</dt>
                <dd className="tabular font-semibold text-strong">
                  {s.stars ? (
                    <>
                      <Stars count={s.stars} /> <span className="text-sm font-normal text-muted">{s.value}</span>
                    </>
                  ) : (
                    s.value
                  )}
                </dd>
                {s.note && <dd className="text-xs text-muted">{s.note}</dd>}
              </div>
            ))}
          </dl>

          {fund.rate3y !== null && fund.rate3yText && (
            <ReturnCalculator rate={fund.rate3y} rateText={fund.rate3yText} defaultAmount={fund.box.defaultAmount} minAmount={fund.box.minAmount} />
          )}

          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">Fund facts</h2>
            <dl className="mt-2 divide-y divide-line text-sm">
              {fund.facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="tabular text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Made-up fund and prices for a case study. Not investment advice.</p>
          </section>
        </div>
        <div className="lg:sticky lg:top-28">
          <OrderCard fundId={fund.id} {...fund.box} />
        </div>
      </div>
    </div>
  );
}
