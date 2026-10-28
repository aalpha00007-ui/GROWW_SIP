// The fund page (spec §8 /fund/[id]): fund facts, and the SIP box with the goal row (PRD F2), which
// sits on the right and stays in view from 1024px.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SipBox } from '@/components/sip-box';
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
    <div className="space-y-5">
      <Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
        ← Mutual funds
      </Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">Simulated fund</p>
            <h1 className="text-2xl font-bold">{fund.name}</h1>
            <p className="text-sm text-muted">
              {fund.category} · {fund.risk} risk
            </p>
            <p className="tabular mt-4 text-2xl font-bold text-strong">{fund.nav}</p>
            <p className="text-sm text-muted">{fund.navDate}</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-bold">Fund facts</h2>
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
        <div className="lg:sticky lg:top-20">
          <SipBox fundId={fund.id} {...fund.box} />
        </div>
      </div>
    </div>
  );
}
