// Before you stop (PRD F7, spec §2F): the goal card on top, then the reason, the AI card and five options.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BeforeYouStop } from '@/components/before-you-stop';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { OPTIONS } from '@/pipeline/retrieval/checkin';
import { idParam } from '@/server/api';
import { toRupeeSign } from '@/server/money';
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
      <Link href={`/sips/${sip.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">
        ← Back to the SIP
      </Link>
      <h1 className="text-2xl font-bold">Before you stop</h1>

      <section className="rounded-xl border border-primary bg-primary-soft p-4">
        <p className="text-sm font-semibold text-primary">{sip.fund}</p>
        <p className="mt-1 text-lg font-bold">{toRupeeSign(sip.goalLine)}</p>
      </section>

      {sip.status === 'stopped' ? (
        <p className="rounded-xl border border-line bg-surface p-4">This SIP is already stopped. Your units stay invested until you redeem them.</p>
      ) : (
        <BeforeYouStop sipId={sip.id} controls={sip.controls} pauseChoices={sip.pauseChoices} options={OPTIONS.map((o) => ({ key: o.key, label: o.label }))} />
      )}
    </div>
  );
}
