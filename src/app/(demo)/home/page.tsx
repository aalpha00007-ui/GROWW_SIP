// Home (PRD F4, F12), laid out after the reference: on the left, "Your goals" first (the case study's main
// feature), then Popular funds and Funds by category; on the right, Your investments, the demo control,
// Coming up, and Products & Tools. One column below 1024px, the right column under the left.
// The page prints what homeView and homeFunds format.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChangePill } from '@/components/change-pill';
import { GoalCard } from '@/components/goal-card';
import { Icon, type IconName } from '@/components/icons';
import { MarketFallButton } from '@/components/market-fall-button';
import { SectionTitle } from '@/components/section-title';
import { Signed } from '@/components/signed';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { homeView } from '@/server/home';
import { homeFunds, type RiskLevel } from '@/server/market';
import { currentVisitor } from '@/server/visitor';

const CARD = 'rounded-xl border border-line bg-surface p-5';
const LINK_CARD = `${CARD} block transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]`;
const RISK: Record<RiskLevel, { dot: string; text: string }> = {
  low: { dot: 'bg-gain', text: 'text-gain' },
  moderate: { dot: 'bg-accent', text: 'text-accent-ink' },
  high: { dot: 'bg-loss', text: 'text-loss' },
};

export default async function Home() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const db = getDb();
  const [home, funds] = await Promise.all([homeView(db, visitor.id, todayInIndia()), homeFunds(db, visitor.id)]);
  const tools: { label: string; href: string; icon: IconName; pill?: string }[] = [
    { label: 'SIPs', href: '/sips', icon: 'sips', pill: home.activeSips ? `${home.activeSips} active` : undefined },
    { label: 'Goals', href: '/home#your-goals', icon: 'goals', pill: home.goalCount ? `${home.goalCount} ${home.goalCount === 1 ? 'goal' : 'goals'}` : undefined },
    { label: 'Portfolio', href: '/portfolio', icon: 'portfolio' },
    { label: 'Explore funds', href: '/explore', icon: 'explore' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
      {/* A container: the card rows follow this column's width, so 1024px (a narrow left column) wraps them. */}
      <div className="@container space-y-6">
        <section>
          <SectionTitle id="your-goals" title="Your goals" link={{ label: 'See all', href: '/sips' }} />
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
          <SectionTitle title="Popular funds" link={{ label: 'See more', href: '/explore' }} />
          <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
            {funds.popular.map((fund) => (
              <li key={fund.id}>
                <Link href={`/fund/${fund.id}`} className={`${LINK_CARD} h-full`}>
                  <span className="grid size-11 place-items-center rounded-lg border border-line bg-surface text-sm font-semibold text-strong" aria-hidden="true">
                    {fund.initials}
                  </span>
                  <span className="mt-3 line-clamp-2 block min-h-12 text-[15px] text-ink">{fund.name}</span>
                  <span className="tabular mt-2 block text-base font-medium text-strong">{fund.nav}</span>
                  {fund.change && (
                    <span className="mt-0.5 block text-sm">
                      <Signed value={fund.change} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle title="Funds by category" link={{ label: 'See more', href: '/explore' }} />
          <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
            {funds.categories.map((c) => (
              <li key={c.category}>
                <Link href={c.href} className={`${LINK_CARD} h-full`}>
                  <span className="grid size-11 place-items-center rounded-lg border border-line bg-surface text-primary">
                    <Icon name={c.icon} />
                  </span>
                  <span className="mt-3 block text-[15px] text-ink">{c.label}</span>
                  <span className="mt-1 block text-sm text-muted">{c.count}</span>
                  <span className={`mt-2 flex items-start gap-1.5 text-sm font-medium ${RISK[c.risk.level].text}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${RISK[c.risk.level].dot}`} aria-hidden="true" />
                    {c.risk.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="space-y-6">
        <section>
          <SectionTitle title="Your investments" />
          {home.summary ? (
            <div className={CARD}>
              <p className="text-sm text-muted">Your mutual funds · {home.summary.sipCount}</p>
              <p className="tabular mt-1 text-[28px] font-bold leading-tight text-strong">{home.summary.value}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                {home.summary.change && <ChangePill change={home.summary.change} />}
                <span className="tabular">{home.summary.putIn} put in</span>
              </div>
              <Link href="/portfolio" className="mt-4 inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:text-primary-hover">
                View portfolio
                <Icon name="chevron" size={16} />
              </Link>
            </div>
          ) : (
            <div className={`${CARD} text-center`}>
              <EmptyInvestments />
              <p className="mt-3 font-medium text-strong">You haven&apos;t invested yet</p>
              <Link
                href="/explore"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Explore funds
              </Link>
            </div>
          )}
        </section>

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
                    <span className="tabular shrink-0 text-base font-medium text-strong">{item.amount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle title="Products & Tools" />
          <ul className={`${CARD} divide-y divide-line py-1`}>
            {tools.map((tool) => (
              <li key={tool.label}>
                <Link href={tool.href} className="flex min-h-12 items-center gap-3 py-3 text-[15px] text-ink hover:text-primary">
                  <Icon name={tool.icon} className="text-primary" />
                  <span className="flex-1">{tool.label}</span>
                  {tool.pill && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{tool.pill}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Our own small line drawing for "You haven't invested yet": a seedling in a pot. */
function EmptyInvestments() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mx-auto">
      <path d="M34 50h28l-4 18H38z" className="stroke-muted" />
      <path d="M30 50h36" className="stroke-muted" />
      <path d="M48 50V28" className="stroke-primary" />
      <path d="M48 36c-10 0-15-6-15-14 9 0 15 5 15 14Z" className="stroke-primary" />
      <path d="M48 30c0-9 6-15 16-15 0 9-6 15-16 15Z" className="stroke-primary" />
    </svg>
  );
}
