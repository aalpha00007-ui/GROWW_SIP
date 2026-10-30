// F&O (brief phase 5), display only. Explore after the layout reference: Top traded (Equity / Commodities, with
// candles) and F&O stocks on the left; Positions (F&O returns ₹0.00) and Products & tools on the right.
// Positions is empty and Orders lists sample orders that never filled (a new demo account has none). Every
// contract and price is made up.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FoTopTraded } from '@/components/fo-top-traded';
import { Initials } from '@/components/fund-rows';
import { Icon, type IconName } from '@/components/icons';
import { SectionTitle } from '@/components/section-title';
import { Signed } from '@/components/signed';
import { DataTable, DEMO_ONLY, DemoTrade, NoRows } from '@/components/trading-ui';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { foExplore, foOrders, showsSampleRows } from '@/server/trading';
import { initials } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

const CARD = 'rounded-xl border border-line bg-surface p-5';

export default async function FutureAndOptions({ params }: { params: Promise<{ tab?: string[] }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const { tab } = await params;
  const section = tab?.[0];
  if (tab && (tab.length > 1 || (section !== 'positions' && section !== 'orders'))) notFound();

  if (section === 'positions') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Positions</h1>
        <div className={`${CARD} text-center`}>
          <p className="font-medium text-strong">No open F&amp;O positions</p>
          <p className="mt-1 text-sm text-muted">F&amp;O returns ₹0.00 · {DEMO_ONLY}</p>
        </div>
      </div>
    );
  }
  if (section === 'orders') {
    const orders = foOrders(todayInIndia(), showsSampleRows(visitor));
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        {orders.length === 0 ? (
          <NoRows title="No F&amp;O orders yet" />
        ) : (
          <DataTable
            head={[{ label: 'Date' }, { label: 'Contract' }, { label: 'Side' }, { label: 'Lots', right: true }, { label: 'Price', right: true }, { label: 'Status', right: true }]}
            rows={orders.map((o) => [
              o.date,
              <span key="c" className="font-medium text-strong">
                {o.contract}
              </span>,
              o.side,
              o.lots,
              o.price,
              <span key="s" className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === 'Rejected' ? 'bg-loss-soft text-loss-strong' : 'bg-page text-muted'}`}>
                {o.status}
              </span>,
            ])}
            note="Sample orders to show the layout: made-up contracts, none of them filled. F&O is display only in this prototype."
          />
        )}
      </div>
    );
  }

  const data = await foExplore(getDb());
  const tools: { label: string; href: string; icon: IconName }[] = [
    { label: 'Option chain', href: '/soon/options', icon: 'screener' },
    { label: 'Margin calculator', href: '/soon/margin', icon: 'calculator' },
    { label: 'Learn F&O', href: '/soon/fo-learn', icon: 'help' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
      <div className="@container space-y-8">
        <section>
          <SectionTitle title="Top traded" link={{ label: 'See more', href: '/soon/options' }} />
          <FoTopTraded equity={data.equity} commodities={data.commodities} />
        </section>

        <section>
          <SectionTitle title="F&O stocks" />
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.stocks.map((s) => (
              <li key={s.symbol} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Initials text={initials(s.name)} />
                <div className="min-w-0 flex-1 basis-32">
                  <p className="font-medium text-strong">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.symbol} · {s.lot}
                  </p>
                </div>
                <div className="tabular text-right">
                  <p className="font-medium text-strong">{s.price}</p>
                  {s.change && (
                    <p className="text-sm">
                      <Signed value={s.change} />
                    </p>
                  )}
                </div>
                <DemoTrade id={`fo-${s.symbol}`} align="end" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Made-up companies, contracts and prices. {DEMO_ONLY}</p>
        </section>
      </div>

      <div className="space-y-6">
        <section>
          <SectionTitle title="Positions" link={{ label: 'Dashboard', href: '/fo/positions' }} />
          <div className={CARD}>
            <p className="text-sm text-muted">F&amp;O returns</p>
            <p className="tabular mt-0.5 text-[28px] font-bold leading-tight text-strong">₹0.00</p>
            <p className="mt-1 text-sm text-muted">No open positions. {DEMO_ONLY}</p>
          </div>
        </section>
        <section>
          <SectionTitle title="Products & tools" />
          <ul className={`${CARD} divide-y divide-line py-1`}>
            {tools.map((tool) => (
              <li key={tool.label}>
                <Link href={tool.href} className="flex min-h-12 items-center gap-3 py-3 text-[15px] text-ink hover:text-primary">
                  <Icon name={tool.icon} className="text-primary" />
                  <span className="flex-1">{tool.label}</span>
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
