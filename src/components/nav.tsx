'use client';
// The app shell's tabs (PRD F13): a bottom tab bar on phones, the same tabs in the top bar from 1024px.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { href: '/explore', label: 'Explore', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z' },
  { href: '/sips', label: 'SIPs', icon: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4' },
  { href: '/portfolio', label: 'Portfolio', icon: 'M12 3v9h9a9 9 0 1 1-9-9Zm3 0a6 6 0 0 1 6 6h-6z' },
  { href: '/profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0' },
] as const;

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Desktop: the tabs inside the top bar. */
export function TopTabs() {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={isActive(t.href) ? 'page' : undefined}
          className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${isActive(t.href) ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink'}`}
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
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={isActive(t.href) ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive(t.href) ? 'text-primary' : 'text-muted'}`}
            >
              <Icon d={t.icon} />
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
