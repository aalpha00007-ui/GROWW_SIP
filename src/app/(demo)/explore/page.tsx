// Mutual Funds -> Explore, laid out after the reference in two columns. Left: Popular funds, Collections and
// the new fund offers. Right: Your investments, the demo control and Products and tools. One column below
// 1024px, the right column under the left. Every fund, return and offer is made up.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Initials } from '@/components/fund-rows';
import { Icon, type IconName } from '@/components/icons';
import { InvestmentsCard } from '@/components/investments-card';
import { MarketFallButton } from '@/components/market-fall-button';
import { SectionTitle } from '@/components/section-title';
import { Signed } from '@/components/signed';
import { getDb } from '@/db/pool';
import { exploreFunds } from '@/server/funds';
import { investmentsView } from '@/server/investments';
import { currentVisitor } from '@/server/visitor';

const CARD = 'rounded-xl border border-line bg-surface p-5';
const LINK_CARD = `${CARD} block transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]`;

export default async function Explore() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const db = getDb();
  const [funds, investments] = await Promise.all([exploreFunds(db, visitor.id), investmentsView(db, visitor.id)]);
  const tools: { label: string; href: string; icon: IconName; pill?: string }[] = [
    { label: 'NFO live', href: '/soon/nfo', icon: 'nfo', pill: `${funds.nfos.length} open` },
    { label: 'SIP calculator', href: '/calculators/sip', icon: 'calculator' },
    { label: 'Goal planner', href: '/calculators/goal', icon: 'calculator' },
    { label: 'SWP calculator', href: '/calculators/swp', icon: 'calculator' },
    { label: 'Compare funds', href: '/soon/compare', icon: 'compare' },
    { label: 'Import funds', href: '/soon/import', icon: 'import' },
    { label: 'File tax', href: '/soon/tax', icon: 'tax' },
    { label: 'My goals', href: '/dashboard#your-goals', icon: 'goals' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
      {/* A container: the card rows follow this column's width, so 1024px (a narrow left column) wraps them. */}
      <div className="@container space-y-8">
        <section>
          <SectionTitle title="Popular funds" link={{ label: 'All mutual funds', href: '/funds' }} />
          <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
            {funds.popular.map((fund) => (
              <li key={fund.id}>
                <Link href={`/fund/${fund.id}`} className={`${LINK_CARD} h-full`}>
                  <Initials text={fund.initials} />
                  <span className="mt-3 line-clamp-2 block min-h-12 text-[15px] text-ink">{fund.name}</span>
                  <span className="mt-2 flex items-baseline gap-1.5 text-base">
                    {fund.return3y ? <Signed value={fund.return3y} /> : <span className="text-muted">New</span>}
                    <span className="text-sm text-muted">3Y</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle title="Collections" />
          <ul className="grid grid-cols-2 gap-4 @lg:grid-cols-4">
            {funds.collections.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className={`${LINK_CARD} flex h-full flex-col items-center px-3 text-center`}>
                  <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
                    <Icon name={c.icon} />
                  </span>
                  <span className="mt-3 block text-sm font-medium text-ink">{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle title="New fund offers (demo)" link={{ label: 'See all', href: '/soon/nfo' }} />
          <ul className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
            {funds.nfos.map((nfo) => (
              <li key={nfo.name} className={`${CARD} flex items-start gap-3`}>
                <Initials text={nfo.initials} />
                <div className="min-w-0">
                  <p className="font-medium text-strong">{nfo.name}</p>
                  <p className="text-sm text-muted">
                    {nfo.category} · {nfo.minAmount}
                  </p>
                  <p className="mt-1 text-sm font-medium text-accent-ink">{nfo.closes}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Made-up offers to show the layout. They cannot be bought in this prototype.</p>
        </section>
      </div>

      <div className="space-y-6">
        <InvestmentsCard view={investments} link={{ label: 'Dashboard', href: '/dashboard' }} />
        <MarketFallButton />
        <section>
          <SectionTitle title="Products and tools" />
          <ul className={`${CARD} divide-y divide-line py-1`}>
            {tools.map((tool) => (
              <li key={tool.label}>
                <Link href={tool.href} className="flex min-h-12 items-center gap-3 py-3 text-[15px] text-ink hover:text-primary">
                  <Icon name={tool.icon} className="text-primary" />
                  <span className="flex-1">{tool.label}</span>
                  {tool.pill && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">{tool.pill}</span>}
                  <Icon name="chevron" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
