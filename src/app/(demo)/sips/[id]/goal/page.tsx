// Set or edit a SIP's goal (spec §8 /sips/[id]/goal), with the same chips as the SIP box (spec §2A).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GoalForm } from '@/components/goal-form';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { sipIdParam } from '@/server/api';
import { goalYearChoices, loadSip } from '@/server/sip';
import { GOAL_KINDS, GOAL_NAME_MAX } from '@/server/sip-actions';
import { currentVisitor } from '@/server/visitor';

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const today = todayInIndia();
  const sip = await loadSip(getDb(), visitor.id, await sipIdParam(params), today);
  if (!sip) notFound();
  const goal = sip.facts.goal;
  const targetMonth = goal?.target_month?.slice(0, 7) ?? null;
  const current = goal && sip.goalKind ? { kind: sip.goalKind, name: goal.name, targetMonth } : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/sips/${sip.facts.sip_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">
        ← Back to the SIP
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{goal ? 'Edit goal' : 'Add a goal'}</h1>
        <p className="text-sm text-muted">{sip.facts.fund_name}</p>
      </div>
      <GoalForm
        sipId={sip.facts.sip_id}
        kinds={GOAL_KINDS.map((k) => ({ kind: k.kind, label: k.label }))}
        current={current}
        {...goalYearChoices(today, targetMonth)}
        nameMax={GOAL_NAME_MAX}
      />
    </div>
  );
}
