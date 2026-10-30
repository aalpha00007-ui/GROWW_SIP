// All mutual funds (spec §8): category chips, a risk filter and the list. Every fund is made up.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FundRows } from '@/components/fund-rows';
import { getDb } from '@/db/pool';
import { fundList } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface hover:border-primary'}`;

export default async function AllFunds({ searchParams }: { searchParams: Promise<{ category?: string; risk?: string }> }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const { category, risk } = await searchParams;
  const list = await fundList(getDb(), visitor.id, { category, risk });
  const href = (next: { category?: string | null; risk?: string | null }) => {
    const q = new URLSearchParams();
    const c = next.category === undefined ? list.category : next.category;
    const r = next.risk === undefined ? list.risk : next.risk;
    if (c) q.set('category', c);
    if (r) q.set('risk', r);
    return q.size ? `/funds?${q}` : '/funds';
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/explore" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary-hover">
          ← Explore
        </Link>
        <h1 className="text-2xl font-bold">All mutual funds</h1>
        <p className="text-sm text-muted">{list.funds.length} made-up funds · Demo data</p>
      </div>

      <div className="space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Category">
          <Link href={href({ category: null })} className={chip(!list.category)}>
            All funds
          </Link>
          {list.categories.map((c) => (
            <Link key={c} href={href({ category: c })} className={chip(list.category === c)}>
              {c}
            </Link>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Risk">
          <Link href={href({ risk: null })} className={chip(!list.risk)}>
            Any risk
          </Link>
          {list.risks.map((r) => (
            <Link key={r} href={href({ risk: r })} className={chip(list.risk === r)}>
              {r}
            </Link>
          ))}
        </div>
      </div>

      {list.funds.length ? (
        <FundRows funds={list.funds} />
      ) : (
        <p className="rounded-xl border border-line bg-surface p-4 text-muted">No funds match these filters.</p>
      )}
      <p className="text-xs text-muted">3Y return is a year at a time, from made-up NAVs. Past returns don&apos;t guarantee future returns.</p>
    </div>
  );
}
