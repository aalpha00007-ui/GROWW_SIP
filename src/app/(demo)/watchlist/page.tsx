// Mutual Funds -> Watchlist: the made-up funds the investor added from a fund page. Each opens its fund page,
// where the same button takes it off again.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FundRows } from '@/components/fund-rows';
import { getDb } from '@/db/pool';
import { watchedFunds } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export default async function Watchlist() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const list = await watchedFunds(getDb(), visitor.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <p className="text-sm text-muted">{list.length === 1 ? '1 fund' : `${list.length} funds`} · Made-up funds, demo data</p>
      </div>
      {list.length > 0 ? (
        <>
          <FundRows funds={list} />
          <p className="text-sm text-muted">To take a fund off, open it and tap In watchlist.</p>
        </>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <p className="font-medium text-strong">No funds in your watchlist yet</p>
          <p className="mt-1 text-sm text-muted">
            On any fund page, tap <span className="font-semibold text-strong">Add to watchlist</span> to keep an eye on it here.
          </p>
          <Link
            href="/explore"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Explore funds
          </Link>
        </div>
      )}
    </div>
  );
}
