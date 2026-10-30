// Mutual Funds -> SIPs (spec §8 /sips): every SIP with its fund, amount, date, next instalment and goal, or
// "Add a goal" with a NEW badge. Pause opens the SIP's pause choices; Stop goes through Before you stop (F7).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icons';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { sipList } from '@/server/sip';
import { currentVisitor } from '@/server/visitor';

const ACTION = 'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-semibold sm:flex-none';
const STATUS = { active: 'bg-primary-soft text-primary', paused: 'bg-accent-tint text-accent-ink', stopped: 'bg-page text-muted' } as const;

export default async function Sips() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const sips = await sipList(getDb(), visitor.id, todayInIndia());

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">SIPs</h1>
          <p className="text-sm text-muted">{sips.length === 1 ? '1 SIP' : `${sips.length} SIPs`} · Demo orders</p>
        </div>
        <Link href="/funds" className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:text-primary-hover">
          Start a new SIP
          <Icon name="chevron" size={16} />
        </Link>
      </div>
      {sips.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {sips.map((sip) => (
            <li key={sip.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/sips/${sip.id}`} className="font-semibold text-strong hover:text-primary">
                    {sip.fund}
                  </Link>
                  <p className="tabular text-sm text-muted">
                    {sip.amount} · {sip.date}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[sip.status]}`}>{sip.statusLabel}</span>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Next instalment</dt>
                  <dd className="tabular font-medium text-strong">{sip.next}</dd>
                </div>
                <div>
                  <dt className="text-muted">Goal</dt>
                  <dd>
                    {sip.goal ? (
                      <span className="font-medium text-primary">{sip.goal}</span>
                    ) : sip.status === 'stopped' ? (
                      <span className="text-muted">No goal</span>
                    ) : (
                      <Link href={`/sips/${sip.id}/goal`} className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-primary hover:text-primary-hover">
                        <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-ink">New</span>
                        Add a goal
                        <Icon name="chevron" size={14} />
                      </Link>
                    )}
                  </dd>
                </div>
              </dl>
              {(sip.canPause || sip.canStop) && (
                <div className="mt-3 flex gap-2">
                  {sip.canPause && (
                    <Link href={`/sips/${sip.id}?change=pause`} className={`${ACTION} border-line hover:border-primary hover:text-primary`}>
                      <Icon name="pause" size={16} />
                      Pause
                    </Link>
                  )}
                  {sip.canStop && (
                    <Link href={`/sips/${sip.id}/stop`} className={`${ACTION} border-loss text-loss hover:bg-loss-soft`}>
                      <Icon name="stop" size={16} />
                      Stop SIP
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-4 text-muted">
          No SIPs yet.{' '}
          <Link href="/funds" className="font-semibold text-primary underline">
            Explore mutual funds
          </Link>
        </p>
      )}
    </div>
  );
}
