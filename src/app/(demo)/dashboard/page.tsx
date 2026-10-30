// Mutual Funds -> Dashboard (PRD F4, F12): the old Home. Left: "Your goals" first (the case study's main
// feature), with "What does this dip mean for my goal?", then every holding with the goal it is for. Right:
// Your investments, the demo control and Coming up. One column below 1024px, the right column under the left.
// The page prints what homeView and investmentsView format.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GoalCard } from '@/components/goal-card';
import { Icon } from '@/components/icons';
import { InvestmentsCard } from '@/components/investments-card';
import { MarketFallButton } from '@/components/market-fall-button';
import { SectionTitle } from '@/components/section-title';
import { Signed } from '@/components/signed';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { homeView } from '@/server/home';
import { investmentsView } from '@/server/investments';
import { currentVisitor } from '@/server/visitor';

const CARD = 'rounded-xl border border-line bg-surface p-5';

export default async function Dashboard() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const db = getDb();
  const [home, investments] = await Promise.all([homeView(db, visitor.id, todayInIndia()), investmentsView(db, visitor.id)]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
      <div className="@container space-y-8">
        <section>
          <SectionTitle id="your-goals" title="Your goals" link={{ label: 'All SIPs', href: '/sips' }} />
          {home.goals.length > 0 ? (
            <div className="grid gap-4 @2xl:grid-cols-2">
              {home.goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>
          ) : (
            <p className={`${CARD} text-muted`}>No goals yet. Add one to a SIP to see it here.</p>
          )}
          {home.noGoal && (
            <div className={`${CARD} mt-4 flex items-center justify-between gap-3`}>
              <div>
                <p className="font-semibold text-strong">{home.noGoal.text}</p>
                <p className="text-sm text-muted">{home.noGoal.funds.join(' · ')}</p>
              </div>
              <Link
                href={home.noGoal.href}
                className="flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Add goal
              </Link>
            </div>
          )}
        </section>

        <section>
          <SectionTitle title="Holdings" />
          {investments ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {investments.holdings.map((h) => {
                const row = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-strong">{h.fund}</span>
                      <span className="block text-sm text-muted">{h.kind}</span>
                      <span className={`block text-sm font-medium ${h.goal ? 'text-primary' : 'text-muted'}`}>{h.goal ?? 'No goal yet'}</span>
                    </span>
                    <span className="tabular shrink-0 text-right">
                      <span className="block font-semibold text-strong">{h.value}</span>
                      <span className="block text-sm text-muted">{h.putIn} put in</span>
                      {h.change && (
                        <span className="block text-sm">
                          <Signed value={h.change} />
                        </span>
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={`${h.sipId ?? 'once'}-${h.fund}`}>
                    {h.sipId !== null ? (
                      <Link href={`/sips/${h.sipId}`} className="flex items-start gap-3 p-4 hover:bg-page">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 p-4">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={`${CARD} text-muted`}>
              Nothing invested yet.{' '}
              <Link href="/funds" className="font-semibold text-primary underline">
                Explore mutual funds
              </Link>
            </p>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <InvestmentsCard view={investments} />
        <MarketFallButton />
        {home.comingUp.length > 0 && (
          <section>
            <SectionTitle title="Coming up" />
            <ul className={`${CARD} divide-y divide-line py-2`}>
              {home.comingUp.map((item) => (
                <li key={item.sipId}>
                  <Link href={`/sips/${item.sipId}`} className="flex min-h-11 items-center justify-between gap-3 py-2.5 hover:text-primary">
                    <span>
                      <span className="block text-[15px] text-ink">{item.fund}</span>
                      <span className="tabular block text-sm text-muted">{item.date}</span>
                    </span>
                    <span className="tabular flex shrink-0 items-center gap-1 text-base font-medium text-strong">
                      {item.amount}
                      <Icon name="chevron" size={16} className="text-muted" />
                    </span>
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
