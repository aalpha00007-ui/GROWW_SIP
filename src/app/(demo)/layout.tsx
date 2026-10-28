// Every page after the welcome screen: only for a visitor who started a demo (PRD F1), inside the app shell (F13).
// The header follows the layout reference: row 1 the logo, product tabs, search and avatar; row 2 the
// sections; then the demo market strip.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/logo';
import { MarketStrip } from '@/components/market-strip';
import { BottomTabs, ProductTabs, SectionTabs } from '@/components/nav';
import { getDb } from '@/db/pool';
import { marketStrip } from '@/server/market';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const strip = await marketStrip(getDb(), visitor.id);
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-6 py-2">
            <div className="flex items-center gap-8">
              <Link href="/home" aria-label="GROWW_SIP home" className="flex min-h-11 items-center">
                <Logo />
              </Link>
              <ProductTabs />
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/explore"
                className="hidden min-h-11 w-64 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted hover:border-primary lg:flex"
              >
                <Icon name="search" size={18} />
                Search mutual funds
              </Link>
              <Link
                href="/profile"
                className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-strong hover:bg-hover-neutral"
                title={visitor.displayName}
              >
                <Avatar name={visitor.firstName} />
                {visitor.firstName}
              </Link>
            </div>
          </div>
          <SectionTabs />
        </div>
      </header>
      <MarketStrip strip={strip} />
      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 lg:pb-12">{children}</main>
      <BottomTabs />
    </>
  );
}
