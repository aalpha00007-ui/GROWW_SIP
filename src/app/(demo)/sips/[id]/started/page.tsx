// After Start SIP (spec §8 /sips/[id]/started). Asks for a goal only when none was set in the SIP box
// (PRD F3), with Save goal and Maybe later.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GoalForm } from '@/components/goal-form';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { idParam } from '@/server/api';
import { loadSip, sipView } from '@/server/sip';
import { goalOptions } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export default async function StartedPage({ params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const today = todayInIndia();
  const state = await loadSip(getDb(), visitor.id, await idParam(params), today);
  if (!state) notFound();
  const sip = sipView(state, today);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-gain">SIP started · Demo order, no real money</p>
        <h1 className="mt-1 text-2xl font-bold">{sip.fund}</h1>
        <p className="tabular text-muted">
          {sip.amount}
          {sip.nextDue && ` · first instalment on ${sip.nextDue}`}
        </p>
        {sip.hasGoal && <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2 font-semibold text-primary">{sip.goalHeader}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`/sips/${sip.id}`} className="flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold hover:border-primary">
            View SIP
          </Link>
          <Link href="/dashboard" className="flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold hover:border-primary">
            View in Dashboard
          </Link>
        </div>
      </section>

      {!sip.hasGoal && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">One more thing: what is this money for?</h2>
            <p className="text-sm text-muted">A goal shows on Home and on this SIP, so you can see what it is for when markets move.</p>
          </div>
          <GoalForm sipId={sip.id} options={goalOptions(today, null)} current={null} laterHref={`/sips/${sip.id}`} />
        </section>
      )}
    </div>
  );
}
