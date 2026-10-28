// Before you stop (PRD F7, spec §2F): the goal card on top, then the reason, the AI card and five options.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BeforeYouStop } from '@/components/before-you-stop';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { OPTIONS } from '@/pipeline/retrieval/checkin';
import { idParam } from '@/server/api';
import { loadSip, sipView } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

export default async function StopPage({ params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const today = todayInIndia();
  const state = await loadSip(getDb(), visitor.id, await idParam(params), today);
  if (!state) notFound();
  const sip = sipView(state, today);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/sips/${sip.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">
        ← Back to the SIP
      </Link>
      <h1 className="text-2xl font-bold">Before you stop</h1>

      <section className="rounded-xl border border-brand bg-brand-tint p-4">
        <p className="text-sm font-semibold text-brand">{sip.fund}</p>
        {/* A no-break space keeps "Rs 14,000" on one line. */}
        <p className="mt-1 text-lg font-bold">{sip.goalLine.replaceAll('Rs ', 'Rs ')}</p>
      </section>

      {sip.status === 'stopped' ? (
        <p className="rounded-xl border border-line bg-card p-4">This SIP is already stopped. Your units stay invested until you redeem them.</p>
      ) : (
        <BeforeYouStop sipId={sip.id} controls={sip.controls} pauseChoices={sip.pauseChoices} options={OPTIONS.map((o) => ({ key: o.key, label: o.label }))} />
      )}
    </div>
  );
}
