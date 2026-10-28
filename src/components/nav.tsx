'use client';
// The app shell's tabs (PRD F13), after the layout reference. Header row 1: the product tabs (Stocks and F&O
// open "Not part of this prototype"). Row 2 from 1024px: Home · Explore · SIPs · Portfolio. Phones keep the
// bottom tab bar, with Profile; on larger screens Profile opens from the avatar.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

const SECTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/explore', label: 'Explore', icon: 'explore' },
  { href: '/sips', label: 'SIPs', icon: 'sips' },
  { href: '/portfolio', label: 'Portfolio', icon: 'portfolio' },
];
const PROFILE = { href: '/profile', label: 'Profile', icon: 'profile' as IconName };

const PRODUCTS = [
  { href: '/soon/stocks', label: 'Stocks' },
  { href: '/soon/fo', label: 'F&O' },
  { href: '/home', label: 'Mutual Funds' },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** Header row 1: Mutual Funds is the product this prototype builds, so it is active everywhere else. */
export function ProductTabs() {
  const path = usePathname();
  const active = PRODUCTS.find((p) => p.href !== '/home' && path.startsWith(p.href))?.label ?? 'Mutual Funds';
  return (
    <nav aria-label="Products" className="hidden items-center gap-6 md:flex">
      {PRODUCTS.map((p) => (
        <Link
          key={p.label}
          href={p.href}
          aria-current={active === p.label ? 'page' : undefined}
          className={`flex min-h-11 items-center text-xl font-medium ${active === p.label ? 'text-strong' : 'text-muted hover:text-ink'}`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/** Header row 2 from 1024px: the active tab is dark with a 3px underline, no pill. */
export function SectionTabs() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="hidden gap-8 lg:flex">
      {SECTIONS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={isActive(t.href) ? 'page' : undefined}
          className={`flex min-h-11 items-center border-b-[3px] text-base font-medium ${isActive(t.href) ? 'border-strong text-strong' : 'border-transparent text-muted hover:text-ink'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone and tablet: a tab bar fixed to the bottom of the screen. */
export function BottomTabs() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {[...SECTIONS, PROFILE].map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={isActive(t.href) ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(t.href) ? 'text-strong' : 'text-muted'}`}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
