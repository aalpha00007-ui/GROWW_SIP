// Stocks (brief phase 5), display only. Explore in two columns after the layout reference: Popular stocks and
// Popular bonds on the left; Your investments (empty) and Products & Tools on the right. Holdings, Positions,
// Orders and Watchlist are sample tables. Every company, bond and price is made up; Buy and Sell do nothing.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Initials } from '@/components/fund-rows';
import { Icon, type IconName } from '@/components/icons';
import { EmptyInvestments } from '@/components/investments-card';
import { SectionTitle } from '@/components/section-title';
import { Signed } from '@/components/signed';
import { DataTable, DEMO_ONLY, DemoTrade, Rating } from '@/components/trading-ui';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { stocksExplore, stockTables } from '@/server/trading';
import { currentVisitor } from '@/server/visitor';

const CARD = 'rounded-xl border border-line bg-surface p-5';
const SAMPLE = 'Sample rows to show the layout: made-up stocks, not yours. Stocks are display only in this prototype.';
const TITLES: Record<string, string> = { holdings: 'Holdings', positions: 'Positions', orders: 'Orders', watchlist: 'Watchlist' };

export default async function Stocks({ params }: { params: Promise<{ tab?: string[] }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const { tab } = await params;
  const section = tab?.[0];
  if (tab && (tab.length > 1 || !TITLES[section!])) notFound();
  const db = getDb();
  const today = todayInIndia();
  return section ? <StockTable db={db} today={today} section={section} /> : <Explore db={db} today={today} />;
}

async function Explore({ db, today }: { db: ReturnType<typeof getDb>; today: string }) {
  const data = await stocksExplore(db, today);
  const tools: { label: string; href: string; icon: IconName; pill?: string }[] = [
    { label: 'IPO', href: '/soon/ipo', icon: 'ipo', pill: `${data.openIpos} open` },
    { label: 'Bonds', href: '/soon/bonds', icon: 'bond', pill: `${data.openBonds} open` },
    { label: 'ETFs', href: '/soon/etfs', icon: 'etf' },
    { label: 'Stock SIP', href: '/soon/stock-sip', icon: 'sips' },
    { label: 'Screener', href: '/soon/screener', icon: 'screener' },
    { label: 'Events calendar', href: '/soon/events', icon: 'calendar' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:items-start">
      <div className="@container space-y-8">
        <section>
          <SectionTitle title="Popular stocks" link={{ label: 'See more', href: '/stocks/watchlist' }} />
          <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
            {data.popular.map((s) => (
              <li key={s.symbol} className={`${CARD} flex flex-col`}>
                <Initials text={s.initials} />
                <span className="mt-3 line-clamp-2 block min-h-12 text-[15px] text-ink">{s.name}</span>
                <span className="tabular mt-2 block font-medium text-strong">{s.price}</span>
                {s.change && (
                  <span className="text-sm">
                    <Signed value={s.change} />
                  </span>
                )}
                <span className="mt-3">
                  <DemoTrade id={s.symbol} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle title="Popular bonds" link={{ label: 'See more', href: '/soon/bonds' }} />
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.bonds.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-medium text-strong">{b.name}</p>
                  <p className="text-sm text-muted">{b.maturity}</p>
                </div>
                <dl className="flex items-center gap-5 text-sm">
                  <div className="text-right">
                    <dt className="text-xs text-muted">Yield</dt>
                    <dd className="tabular font-semibold text-strong">{b.yield}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-muted">Left</dt>
                    <dd className="tabular text-strong">{b.months}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Rating</dt>
                    <dd>
                      <Rating rating={b.rating} level={b.level} />
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Made-up issuers and yields. {DEMO_ONLY}</p>
        </section>
      </div>

      <div className="space-y-6">
        <section>
          <SectionTitle title="Your investments" />
          <div className={`${CARD} text-center`}>
            <EmptyInvestments />
            <p className="mt-3 font-medium text-strong">No stock investments</p>
            <p className="mt-1 text-sm text-muted">{DEMO_ONLY}</p>
            <Link href="/explore" className="mt-4 inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover">
              Go to Mutual Funds
              <Icon name="chevron" size={16} />
            </Link>
          </div>
        </section>
        <section>
          <SectionTitle title="Products & Tools" />
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

async function StockTable({ db, today, section }: { db: ReturnType<typeof getDb>; today: string; section: string }) {
  const t = await stockTables(db, today);
  const name = (n: string, symbol: string) => (
    <span>
      <span className="block font-medium text-strong">{n}</span>
      <span className="block text-xs text-muted">{symbol}</span>
    </span>
  );
  const status = (s: string) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s === 'Executed' ? 'bg-primary-soft text-primary' : s === 'Rejected' ? 'bg-loss-soft text-loss-strong' : 'bg-page text-muted'}`}>{s}</span>
  );
  const tables = {
    holdings: () => (
      <DataTable
        head={[{ label: 'Stock' }, { label: 'Qty', right: true }, { label: 'Avg price', right: true }, { label: 'Price', right: true }, { label: 'Value', right: true }, { label: 'Returns', right: true }]}
        rows={t.holdings.map((h) => [name(h.name, h.symbol), h.qty, h.avg, h.ltp, h.value, <Signed key="p" value={h.pnl} />])}
        note={SAMPLE}
      />
    ),
    positions: () => (
      <DataTable
        head={[{ label: 'Stock' }, { label: 'Side' }, { label: 'Qty', right: true }, { label: 'Avg price', right: true }, { label: 'Price', right: true }, { label: 'P&L', right: true }]}
        rows={t.positions.map((p) => [name(p.name, p.symbol), p.side, p.qty, p.avg, p.ltp, <Signed key="p" value={p.pnl} />])}
        note={SAMPLE}
      />
    ),
    orders: () => (
      <DataTable
        head={[{ label: 'Date' }, { label: 'Stock' }, { label: 'Side' }, { label: 'Qty', right: true }, { label: 'Price', right: true }, { label: 'Status', right: true }]}
        rows={t.orders.map((o) => [o.date, name(o.name, o.symbol), o.side, o.qty, o.price, status(o.status)])}
        note={SAMPLE}
      />
    ),
    watchlist: () => (
      <DataTable
        head={[{ label: 'Name' }, { label: 'Type' }, { label: 'Price', right: true }, { label: 'Day change', right: true }, { label: '', right: true }]}
        rows={t.watchlist.map((w) => [name(w.name, w.symbol), w.kind, w.price, w.change ? <Signed key="c" value={w.change} /> : '', <DemoTrade key="t" id={w.symbol} align="end" />])}
        note={SAMPLE}
      />
    ),
  } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">{TITLES[section]}</h1>
      {tables[section as keyof typeof tables]()}
    </div>
  );
}
