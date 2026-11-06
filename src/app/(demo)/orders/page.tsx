// All orders: every instalment across all SIPs, newest first, with its fund, amount and whether it was paid, skipped
// or is a scheduled skip, plus one-time orders. The "Instalment paid" notification opens its row here.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { ordersView } from '@/server/orders';
import { currentVisitor, NO_DEMO } from '@/server/visitor';

const STATE_STYLE: Record<string, string> = {
  paid: 'text-muted',
  one_time: 'text-muted',
  skipped: 'font-semibold text-accent-ink',
  scheduled_skip: 'font-semibold text-accent-ink',
  not_collected: 'text-muted',
};

export default async function Orders({ searchParams }: { searchParams: Promise<{ instalment?: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect(NO_DEMO);
  const { rows, demoDate, hasNotCollected } = await ordersView(getDb(), visitor.id, todayInIndia());
  const { instalment } = await searchParams;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">All orders</h1>
        <p className="text-sm text-muted">{demoDate} · Demo orders, no real money</p>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Your instalments and orders">
          {rows.map((row) => {
            const opened = row.instalmentId !== null && String(row.instalmentId) === instalment;
            return (
              <li key={row.key} id={row.anchor ?? undefined} aria-current={opened ? 'true' : undefined} className={`scroll-mt-32 p-4 ${opened ? 'bg-primary-soft' : ''}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0">
                    {row.sipId !== null ? (
                      <Link href={`/sips/${row.sipId}`} className="font-medium text-strong underline underline-offset-2 hover:text-primary">
                        {row.fund}
                      </Link>
                    ) : (
                      <span className="font-medium text-strong">{row.fund}</span>
                    )}
                    <span className="tabular block text-sm text-muted">{row.date}</span>
                  </span>
                  <span className="tabular shrink-0 text-right">
                    <span className="block font-semibold text-strong">{row.amount}</span>
                    <span className={`block text-sm ${STATE_STYLE[row.state]}`}>{row.status}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-4 text-muted">
          No orders yet.{' '}
          <Link href="/funds" className="font-semibold text-primary underline">
            Explore mutual funds
          </Link>
        </p>
      )}
      {hasNotCollected && (
        <p className="text-sm text-muted">
          Not collected: the demo doesn&apos;t collect instalments on its own, so a due date can pass with no payment. Nothing was charged.
        </p>
      )}
    </div>
  );
}
