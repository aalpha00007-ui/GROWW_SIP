'use client';
// The app shell's tabs (PRD F13), after the layout reference. Row 1: Stocks · F&O · Mutual Funds.
// Row 2: the sections of whichever product is open, with its button on the right (Terminal or Cart).
// On phones both rows scroll sideways; the page itself never does.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

type Product = 'stocks' | 'fo' | 'mf';

const PRODUCTS: { key: Product; label: string; href: string }[] = [
  { key: 'stocks', label: 'Stocks', href: '/stocks' },
  { key: 'fo', label: 'F&O', href: '/fo' },
  { key: 'mf', label: 'Mutual Funds', href: '/explore' },
];

/** Each tab, with the other paths that count as inside it (a fund page belongs to Explore). */
const SECTIONS: Record<Product, { label: string; href: string; also?: string[] }[]> = {
  stocks: [
    { label: 'Explore', href: '/stocks' },
    { label: 'Holdings', href: '/stocks/holdings' },
    { label: 'Positions', href: '/stocks/positions' },
    { label: 'Orders', href: '/stocks/orders' },
    { label: 'Watchlist', href: '/stocks/watchlist' },
  ],
  fo: [
    { label: 'Explore', href: '/fo' },
    { label: 'Positions', href: '/fo/positions' },
    { label: 'Orders', href: '/fo/orders' },
  ],
  mf: [
    { label: 'Explore', href: '/explore', also: ['/fund/', '/funds', '/collections/', '/soon/'] },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'SIPs', href: '/sips' },
    { label: 'Watchlist', href: '/watchlist' },
  ],
};

export function productOf(path: string): Product {
  if (path === '/stocks' || path.startsWith('/stocks/')) return 'stocks';
  if (path === '/fo' || path.startsWith('/fo/')) return 'fo';
  return 'mf';
}

export function ProductTabs() {
  const active = productOf(usePathname());
  return (
    <nav aria-label="Products" className="flex items-center gap-5 sm:gap-6">
      {PRODUCTS.map((p) => (
        <Link
          key={p.key}
          href={p.href}
          aria-current={active === p.key ? 'page' : undefined}
          className={`flex min-h-11 shrink-0 items-center text-base font-medium sm:text-xl ${active === p.key ? 'text-strong' : 'text-muted hover:text-ink'}`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** Row 2: the active tab is dark with a 3px underline, no pill. */
export function SectionTabs({ cartCount }: { cartCount: number }) {
  const path = usePathname();
  const product = productOf(path);
  const tabs = SECTIONS[product];
  // The longest matching tab wins, so /stocks/orders lights Orders, not Explore.
  const score = (t: (typeof tabs)[number]) =>
    path === t.href || path.startsWith(`${t.href}/`) ? t.href.length : t.also?.some((p) => path.startsWith(p)) ? 1 : 0;
  const best = tabs.reduce((top, t) => (score(t) > score(top) ? t : top), tabs[0]);
  const active = score(best) > 0 ? best.href : null;

  return (
    <div className="flex items-center justify-between gap-4">
      <nav aria-label="Sections" className="-mb-px flex min-w-0 gap-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active === t.href ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center border-b-[3px] text-[15px] font-medium ${active === t.href ? 'border-strong text-strong' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {product === 'stocks' && (
        <Link href="/soon/terminal" className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-strong hover:border-primary">
          <Icon name="terminal" size={18} />
          Terminal
        </Link>
      )}
      {product === 'mf' && (
        <Link href="/cart" className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-strong hover:border-primary">
          <Icon name="cart" size={18} />
          Cart
          {cartCount > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-xs font-semibold text-white">{cartCount}</span>}
        </Link>
      )}
    </div>
  );
}

/** Shows its children only on Stocks and F&O pages (the market strip). */
export function OnlyOnMarkets({ children }: { children: React.ReactNode }) {
  return productOf(usePathname()) === 'mf' ? null : <>{children}</>;
}
