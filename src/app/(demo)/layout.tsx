// Every page after the landing page: only for a signed-in visitor (PRD F1), inside the app shell (F13).
// The header follows the layout reference: row 1 the logo, Stocks · F&O · Mutual Funds, search, bell and
// avatar; row 2 the open product's sections. The demo market strip shows on Stocks and F&O pages.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AvatarMenu, Bell, SearchBox } from '@/components/header-menus';
import { Logo } from '@/components/logo';
import { MarketStrip } from '@/components/market-strip';
import { OnlyOnMarkets, ProductTabs, SectionTabs } from '@/components/nav';
import { getDb } from '@/db/pool';
import { todayInIndia } from '@/pipeline/loading/dates';
import { marketStrip } from '@/server/market';
import { shellData } from '@/server/shell';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const visitor = await currentVisitor();
  if (!visitor) redirect('/');
  const db = getDb();
  const [strip, shell] = await Promise.all([marketStrip(db, visitor.id), shellData(db, visitor.id, todayInIndia())]);
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex min-w-0 items-center gap-8">
              <Link href="/explore" aria-label="Groww prototype home" className="flex min-h-11 shrink-0 items-center">
                <Logo />
              </Link>
              <div className="hidden md:block">
                <ProductTabs />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <SearchBox suggestions={shell.suggestions} />
              <Bell notifications={shell.notifications} />
              <AvatarMenu name={visitor.firstName} handle={visitor.username ? `@${visitor.username}` : 'Demo persona'} balance={shell.balance} />
            </div>
          </div>
          <div className="overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            <ProductTabs />
          </div>
          <SectionTabs cartCount={shell.cartCount} />
        </div>
      </header>
      <OnlyOnMarkets>
        <MarketStrip strip={strip} />
      </OnlyOnMarkets>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">{children}</main>
    </>
  );
}
