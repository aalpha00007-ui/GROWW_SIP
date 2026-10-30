// The Home goal card (PRD F4): goal, target month, time to go, instalments paid of planned, put in,
// value today and change, the SIPs and one-time investments for it, plus "What does this dip mean for my goal?".
import Link from 'next/link';
import type { GoalCard as Card } from '@/server/home';
import { ChangePill } from './change-pill';

export function GoalCard({ goal }: { goal: Card }) {
  return (
    <article className="flex flex-col rounded-xl border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{goal.name}</h3>
          <p className="text-sm text-muted">{goal.timeToGo}</p>
        </div>
        {goal.targetMonth && <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-sm font-medium text-primary">{goal.targetMonth}</span>}
      </header>

      <div className="mt-4">
        {goal.barPct !== null && (
          <div className="h-2 overflow-hidden rounded-full bg-primary-soft" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${goal.barPct}%` }} />
          </div>
        )}
        <p className="tabular mt-1.5 text-sm font-medium">{goal.paidLabel}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <div>
          <dt className="text-sm text-muted">Put in</dt>
          <dd className="tabular text-base font-medium text-strong">{goal.putIn}</dd>
          {goal.planned && <dd className="tabular text-sm text-muted">of {goal.planned} planned</dd>}
        </div>
        <div>
          <dt className="text-sm text-muted">Value today</dt>
          <dd className="tabular text-base font-medium text-strong">{goal.value}</dd>
        </div>
        {goal.change && (
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
            <dt className="text-sm text-muted">Change vs put in</dt>
            <dd>
              <ChangePill change={goal.change} />
            </dd>
          </div>
        )}
      </dl>

      <ul className="mt-4 space-y-1 text-sm">
        {goal.sips.map((sip) => (
          <li key={sip.id}>
            <Link href={`/sips/${sip.id}`} className="text-primary underline underline-offset-2 hover:text-primary-hover">
              {sip.label}
            </Link>
          </li>
        ))}
        {goal.oneTime.map((label, i) => (
          <li key={i} className="text-ink">
            {label}
          </li>
        ))}
      </ul>

      {/* Only a goal that is down has a dip to explain. */}
      {goal.dipSipId !== null && (
        <Link
          href={`/sips/${goal.dipSipId}?explain=dip`}
          className="mt-4 flex min-h-11 items-center justify-center rounded-lg border border-primary px-3 text-center text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          What does this dip mean for my goal?
        </Link>
      )}
    </article>
  );
}
