// Explore (spec §8): the product tabs, with Mutual funds built in full: category chips, a risk filter
// and the fund list. Every fund is made up and shown as simulated.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PRODUCTS } from '@/components/products';
import { getDb } from '@/db/pool';
import { fundList } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

const chip = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium ${on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface hover:border-primary'}`;

export default async function Explore({ searchParams }: { searchParams: Promise<{ category?: string; risk?: string }> }) {
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
    return q.size ? `/explore?${q}` : '/explore';
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Explore</h1>
      <nav aria-label="Products" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1 border-b border-line">
          {PRODUCTS.map((p) => (
            <li key={p.key} className="shrink-0">
              <Link
                href={p.key === 'mf' ? '/explore' : `/soon/${p.key}`}
                aria-current={p.key === 'mf' ? 'page' : undefined}
                className={`flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${p.key === 'mf' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Category">
          <Link href={href({ category: null })} className={chip(!list.category)}>
            All funds
          </Link>
          {list.categories.map((c) => (
            <Link key={c} href={href({ category: c })} className={chip(list.category === c)}>
              {c}
            </Link>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Risk">
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
        <ul className="grid gap-3 md:grid-cols-2">
          {list.funds.map((f) => (
            <li key={f.id}>
              <Link href={`/fund/${f.id}`} className="flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4 hover:border-primary">
                <span>
                  <span className="block font-semibold">{f.name}</span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-accent-ink">Simulated</span>
                  <span className="mt-1 block text-sm text-muted">
                    {f.category} · {f.risk} risk · {f.minSip}
                  </span>
                </span>
                <span className="tabular shrink-0 text-right text-sm">
                  <span className="block text-muted">NAV</span>
                  <span className="font-semibold">{f.nav}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-4 text-muted">No funds match these filters.</p>
      )}
    </div>
  );
}
