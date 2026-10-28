// Every page after the welcome screen: only for a visitor who started a demo (PRD F1), inside the app shell (F13).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { BottomTabs, TopTabs } from '@/components/nav';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <Link href="/home" aria-label="GROWW prototype home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          <TopTabs />
          <div className="flex items-center gap-2">
            <Link
              href="/explore"
              className="hidden min-h-11 w-56 items-center rounded-lg border border-line px-3 text-sm text-muted hover:border-brand xl:flex"
            >
              Search mutual funds
            </Link>
            <Link
              href="/profile"
              className="flex min-h-11 items-center gap-2 rounded-full bg-brand-tint px-3 text-sm font-semibold text-brand"
              title={visitor.displayName}
            >
              <span className="grid size-7 place-items-center rounded-full bg-brand text-xs text-white">{visitor.firstName[0]}</span>
              {visitor.firstName}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-12">{children}</main>
      <BottomTabs />
    </>
  );
}
