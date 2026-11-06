// After Start SIP (brief phase 4): "SIP started", the goal card (goal, date, amount, instalments, the first
// instalment paid from the demo balance), then View in Dashboard or Start another SIP. A SIP started with
// "Skip for now" shows no goal prompt here: skipping is never nagged.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db/pool';
import { dayMonthYear, monthYear } from '@/pipeline/chunking/format';
import { todayInIndia } from '@/pipeline/loading/dates';
import { idParam } from '@/server/api';
import { inr } from '@/server/money';
import { loadSip } from '@/server/sip';
import { currentVisitor, NO_DEMO } from '@/server/visitor';

export default async function StartedPage({ params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect(NO_DEMO);
  const today = todayInIndia();
  const state = await loadSip(getDb(), visitor.id, await idParam(params), today);
  if (!state) notFound();
  const { facts } = state;
  const first = state.schedule.firstPaid;

  const rows: { label: string; value: string }[] = [
    { label: 'Amount', value: `${inr(facts.amount)} a month` },
    ...(facts.instalments_planned !== null ? [{ label: 'Instalments', value: `About ${facts.instalments_planned}, to ${monthYear(facts.goal!.target_month!)}` }] : []),
    ...(facts.goal?.target_amount ? [{ label: 'Target', value: inr(facts.goal.target_amount) }] : []),
    ...(first
      ? [
          {
            label: 'First instalment',
            value: `${inr(first.amount)} paid from demo balance on ${dayMonthYear(first.paidOn)}${first.due !== first.paidOn ? `, for the ${dayMonthYear(first.due)} date` : ''}`,
          },
        ]
      : []),
    ...(facts.next_due_date ? [{ label: 'Next instalment', value: dayMonthYear(facts.next_due_date) }] : []),
  ];

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <section className="rounded-xl border border-line bg-surface p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-2xl text-primary" aria-hidden="true">
          ✓
        </span>
        <h1 className="mt-3 text-2xl font-bold">SIP started</h1>
        <p className="text-muted">{facts.fund_name}</p>
        <p className="mt-1 text-xs text-muted">Demo order, no real money.</p>
      </section>

      <section className="rounded-xl border border-primary bg-surface p-5" aria-label="Your SIP">
        {facts.goal ? (
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted">This SIP is for</p>
              <h2 className="text-xl font-bold text-strong [overflow-wrap:anywhere]">{facts.goal.name}</h2>
            </div>
            {facts.goal.target_month && (
              <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-ink">by {monthYear(facts.goal.target_month)}</span>
            )}
          </header>
        ) : (
          <h2 className="text-xl font-bold text-strong">Your SIP</h2>
        )}
        <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{r.label}</dt>
              <dd className="tabular text-right font-medium text-strong">{r.value}</dd>
            </div>
          ))}
        </dl>
        {facts.goal && (
          <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink">
            If the market falls, you&apos;ll see this goal next to your SIP on the Dashboard.
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard" className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          View in Dashboard
        </Link>
        <Link href="/funds" className="flex min-h-12 items-center justify-center rounded-lg border border-line px-4 font-semibold text-strong hover:border-primary">
          Start another SIP
        </Link>
      </div>
    </div>
  );
}
