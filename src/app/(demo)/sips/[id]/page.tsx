// The SIP page (PRD F5, F6): the goal header, this SIP's numbers, "What does this dip mean for my goal?",
// the controls with Stop SIP as a text link, and the instalment history.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChangePill } from '@/components/change-pill';
import { DipExplainer } from '@/components/dip-explainer';
import { SipControls } from '@/components/sip-controls';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { idParam } from '@/server/api';
import { loadSip, sipView } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

// What the investor just did, shown once after Before you stop or the goal page sends them here.
const DONE: Record<string, string> = {
  keep: 'Your SIP stays as it is.',
  skip: 'Done. Your next instalment is skipped.',
  pause: 'Done. Your SIP is paused.',
  stop: 'Done. Your SIP is stopped.',
  goal: 'Goal saved.',
};

const STATUS_STYLE = { active: 'bg-gain-tint text-gain-ink', paused: 'bg-accent-tint text-accent-ink', stopped: 'bg-ground text-muted' } as const;

export default async function SipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ explain?: string; change?: string; did?: string }>;
}) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const today = todayInIndia();
  const state = await loadSip(getDb(), visitor.id, await idParam(params), today);
  if (!state) notFound();
  const sip = sipView(state, today);
  const { explain, change, did } = await searchParams;
  const done = did ? DONE[did] : undefined;

  return (
    <div className="space-y-5">
      <Link href="/sips" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">
        ← Your SIPs
      </Link>
      {done && (
        <p role="status" className="rounded-lg bg-brand-tint px-4 py-3 text-sm font-semibold text-brand">
          {done}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold">{sip.fund}</h1>
                <p className="text-sm text-muted">
                  {sip.category} · {sip.amount}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${STATUS_STYLE[sip.status]}`}>{sip.statusLabel}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-tint px-3 py-2">
              <p className="font-semibold text-brand">{sip.goalHeader}</p>
              <Link href={`/sips/${sip.id}/goal`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">
                {sip.hasGoal ? 'Edit goal' : 'Add one'}
              </Link>
            </div>
            {sip.notes.map((note) => (
              <p key={note} className="mt-3 rounded-lg bg-accent-tint px-3 py-2 text-sm text-accent-ink">
                {note}
              </p>
            ))}
          </section>

          <section className="rounded-xl border border-line bg-card p-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-sm text-muted">Put in</dt>
                <dd className="tabular text-lg font-bold">{sip.putIn}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Value today</dt>
                <dd className="tabular text-lg font-bold">{sip.value}</dd>
              </div>
              {sip.change && (
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-sm text-muted">Change vs put in</dt>
                  <dd>
                    <ChangePill change={sip.change} />
                  </dd>
                </div>
              )}
            </dl>
            <ul className="tabular mt-4 space-y-1 border-t border-line pt-3 text-sm text-muted">
              <li>{sip.paidLabel}</li>
              {sip.worstFall && <li>Worst fall since you started: {sip.worstFall}</li>}
              {sip.nextDue && <li>Next instalment: {sip.nextDue}</li>}
            </ul>
            <p className="mt-2 text-xs text-muted">{sip.asOf}</p>
            {sip.explainDip && (
              <div className="mt-4">
                <DipExplainer sipId={sip.id} autoStart={explain === 'dip'} />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-5">
          {sip.status !== 'stopped' && (
            <SipControls
              id={sip.id}
              controls={sip.controls}
              skipLabel={sip.skipLabel}
              pauseChoices={sip.pauseChoices}
              amountNow={sip.amountNow}
              minAmount={sip.minAmount}
              maxAmount={sip.maxAmount}
              amountRange={sip.amountRange}
              openAmount={change === 'amount'}
            />
          )}
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-bold">Instalments</h2>
            {sip.history.length ? (
              <ul className="mt-2 divide-y divide-line text-sm">
                {sip.history.map((row) => (
                  <li key={`${row.date}-${row.label}`} className="tabular flex justify-between gap-3 py-2">
                    <span>{row.date}</span>
                    <span className={row.label === 'Paid' ? 'text-muted' : 'font-semibold text-accent-ink'}>
                      {row.amount ? `${row.amount} · ${row.label}` : row.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No instalments yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
