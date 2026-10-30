'use client';
// The header on the landing page and the public pages (calculators and Learn): the logo, Stocks · F&O · Mutual
// Funds, More, search and Log in / Sign up. Signed out, the tabs, search and Log in / Sign up open the sign-up /
// log-in modal on this page; signed in, they go to Mutual Funds. More only ever opens its own menu.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from './avatar';
import { Icon } from './icons';
import { Logo } from './logo';
import { MoreMenu } from './more-menu';

const TABS = ['Stocks', 'F&O', 'Mutual Funds'];

export function SiteHeader({ visitorName }: { visitorName: string | null }) {
  const path = usePathname();
  const enter = visitorName ? '/explore' : `${path}?auth=signup`;

  return (
    <header className="relative z-30 border-b border-line bg-surface">
      {/* Phones: the tabs and More get a second row, as in the app's header. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 px-4 py-2 md:flex-nowrap md:gap-x-6">
        <Link href="/" aria-label="Groww prototype home" className="flex min-h-11 shrink-0 items-center">
          <Logo />
        </Link>
        <nav aria-label="Products" className="order-last flex basis-full items-center gap-5 md:order-none md:ml-2 md:basis-auto md:gap-6">
          {TABS.map((tab) => (
            <Link key={tab} href={enter} scroll={false} className="flex min-h-11 items-center whitespace-nowrap text-base font-medium text-muted hover:text-ink md:text-lg">
              {tab}
            </Link>
          ))}
          <MoreMenu />
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Link
            href={enter}
            scroll={false}
            // Narrower from 1024px to 1280px, so the tabs and More keep one line each.
            className="hidden min-h-11 w-56 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted hover:border-primary lg:flex xl:w-64"
          >
            <Icon name="search" size={18} />
            Search mutual funds
          </Link>
          {visitorName ? (
            <Link href="/explore" className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-strong hover:bg-hover-neutral">
              <Avatar name={visitorName} />
              {visitorName}
            </Link>
          ) : (
            <Link
              href={`${path}?auth=login`}
              scroll={false}
              className="flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Log in / Sign up
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
