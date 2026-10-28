// Home (PRD F4, F12): goal cards, the "no goal yet" row, coming-up instalments, a mutual-fund summary
// and the "Simulate a market fall" demo control. The page prints what homeView formats.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChangePill } from '@/components/change-pill';
import { GoalCard } from '@/components/goal-card';
import { MarketFallButton } from '@/components/market-fall-button';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { homeView } from '@/server/home';
import { currentVisitor } from '@/server/visitor';

export default async function Home() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const home = await homeView(getDb(), visitor.id, todayInIndia());

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Hi {visitor.firstName}</h1>
        {home.asOf && (
          <p className="text-sm text-muted">
            {home.asOf}
            {home.demoNote && <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-ink">{home.demoNote}</span>}
          </p>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5 lg:col-start-2 lg:row-start-1">
          {home.summary && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm text-muted">Your mutual funds · {home.summary.sipCount}</h2>
              <p className="tabular mt-1 text-2xl font-bold text-strong">{home.summary.value}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                {home.summary.change && <ChangePill change={home.summary.change} />}
                <span className="tabular">{home.summary.putIn} put in</span>
              </div>
            </section>
          )}
          <MarketFallButton />
        </div>

        <div className="space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <section>
            <h2 className="mb-3 text-lg font-bold">Your goals</h2>
            {home.goals.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {home.goals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-surface p-4 text-muted">No goals yet. Add one to a SIP to see it here.</p>
            )}
          </section>

          {home.noGoal && (
            <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <div>
                <h2 className="font-semibold">{home.noGoal.text}</h2>
                <p className="text-sm text-muted">{home.noGoal.funds.join(' · ')}</p>
              </div>
              <Link
                href={home.noGoal.href}
                className="flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Add goal
              </Link>
            </section>
          )}

          {home.summary === null && (
            <p className="rounded-xl border border-line bg-surface p-4 text-muted">
              No SIPs yet.{' '}
              <Link href="/explore" className="font-semibold text-primary underline">
                Explore mutual funds
              </Link>
            </p>
          )}
        </div>

        {home.comingUp.length > 0 && (
          <section className="rounded-xl border border-line bg-surface p-4 lg:col-start-2 lg:row-start-2">
            <h2 className="font-bold">Coming up</h2>
            <ul className="mt-2 divide-y divide-line">
              {home.comingUp.map((item) => (
                <li key={item.sipId}>
                  <Link href={`/sips/${item.sipId}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-primary">
                    <span>
                      <span className="block text-sm font-semibold">{item.fund}</span>
                      <span className="tabular block text-sm text-muted">{item.date}</span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{item.amount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
