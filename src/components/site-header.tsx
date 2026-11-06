'use client';
// The header on the landing page and the public pages (calculators and Learn): the logo, Stocks · F&O · Mutual
// Funds, More, search and Log in / Sign up. Signed out, the tabs and search open the sign-up / log-in modal on this
// page; signed in, they go to Mutual Funds. More only ever opens its own menu.
// Log in / Sign up always shows, so someone opening the site can always switch account; logging in replaces the session.
// Beside it, a demo account shows its name. A demo persona copy shows a neutral "Continue demo": this is where a demo is
// picked, so no persona's name shows before the visitor picks one (a copy started earlier is still open).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from './avatar';
import { Icon } from './icons';
import { Logo } from './logo';
import { MoreMenu } from './more-menu';

const TABS = ['Stocks', 'F&O', 'Mutual Funds'];

export function SiteHeader({ signedIn }: { signedIn: { accountName: string | null } | null }) {
  const path = usePathname();
  const enter = signedIn ? '/explore' : `${path}?auth=signup`;

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
        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <Link
            href={enter}
            scroll={false}
            // Narrower from 1024px to 1280px, so the tabs and More keep one line each. Signed in, the account needs that room.
            className={`hidden min-h-11 w-56 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted hover:border-primary xl:w-64 ${signedIn ? 'xl:flex' : 'lg:flex'}`}
          >
            <Icon name="search" size={18} />
            Search mutual funds
          </Link>
          {/* Below 1024px there's only room for the avatar or the Demo tag, and for "Log in". */}
          {signedIn?.accountName ? (
            <Link
              href="/explore"
              aria-label={`Continue as ${signedIn.accountName}`}
              className="flex min-h-11 items-center gap-2 rounded-full py-1 text-sm font-semibold text-strong hover:bg-hover-neutral lg:pl-1 lg:pr-3"
            >
              <Avatar name={signedIn.accountName} />
              <span className="hidden max-w-32 truncate lg:inline">{signedIn.accountName}</span>
            </Link>
          ) : signedIn ? (
            <Link
              href="/dashboard"
              aria-label="Continue demo"
              className="flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold text-strong hover:border-primary lg:px-4"
            >
              <span className="rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">Demo</span>
              <span className="hidden lg:inline">Continue demo</span>
            </Link>
          ) : null}
          <Link
            href={`${path}?auth=login`}
            scroll={false}
            aria-label="Log in / Sign up"
            className="flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            {signedIn ? (
              <>
                <span className="lg:hidden">Log in</span>
                <span className="hidden lg:inline">Log in / Sign up</span>
              </>
            ) : (
              'Log in / Sign up'
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
