// Mutual Funds -> Cart: what was saved from the order card. Each item opens its fund to start it.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CartRemove } from '@/components/cart-remove';
import { Initials } from '@/components/fund-rows';
import { getDb } from '@/db/pool';
import { cartView } from '@/server/cart';
import { initials } from '@/server/funds';
import { currentVisitor } from '@/server/visitor';

export default async function Cart() {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const cart = await cartView(getDb(), visitor.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Cart</h1>
      {cart.items.length ? (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {cart.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                <Initials text={initials(item.fund)} />
                <div className="min-w-0 flex-1">
                  <Link href={`/fund/${item.fundId}`} className="font-medium text-strong hover:text-primary">
                    {item.fund}
                  </Link>
                  <p className="text-sm text-muted">{item.label}</p>
                </div>
                <p className="tabular font-semibold text-strong">{item.amount}</p>
                <div className="flex w-full gap-2 sm:w-auto">
                  <CartRemove id={item.id} />
                  <Link
                    href={`/fund/${item.fundId}`}
                    className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover sm:flex-none"
                  >
                    {item.kind === 'sip' ? 'Start SIP' : 'Invest'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Total <span className="tabular font-semibold text-strong">{cart.total}</span> · Demo orders, no real money.
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-line bg-surface p-5 text-muted">
          Your cart is empty.{' '}
          <Link href="/funds" className="font-semibold text-primary underline">
            Explore mutual funds
          </Link>
        </p>
      )}
    </div>
  );
}
