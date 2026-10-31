// The landing page (PRD F1), clean and minimal: the header with Log in / Sign up and More, the demo market strip,
// one headline, one button, one big illustration (our own goal map), three demos and a slim footer. Signing up
// and logging in happen in one modal (?auth=signup | login).
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthModal } from '@/components/auth-modal';
import { HeroGoalMap } from '@/components/hero-goal-map';
import { MarketStrip } from '@/components/market-strip';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { StartDemo, TryDemoLink } from '@/components/start-demo';
import { getDb } from '@/db/pool';
import { DEMOS } from '@/server/demos';
import { marketStrip } from '@/server/market';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

export default async function Landing({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const visitor = await currentVisitor();
  // From an app page opened with no demo in this browser (server/visitor.ts NO_DEMO).
  const noDemo = !visitor && (await searchParams).demo === 'none';
  const strip = await marketStrip(getDb(), visitor?.id ?? null);
  // Signed out, Get started opens the sign-up / log-in modal; signed in, it goes to Mutual Funds.
  const enter = visitor ? '/explore' : '/?auth=signup';

  return (
    <>
      <SiteHeader signedIn={visitor && { accountName: visitor.username ? visitor.firstName : null }} />
      <MarketStrip strip={strip} />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-14">
        {noDemo && (
          <p role="status" className="mx-auto mb-8 max-w-2xl rounded-lg border border-line bg-page px-4 py-3 text-center text-sm">
            That page is part of a demo, and no demo is open in this browser. Every demo is a private copy, so a link from someone
            else&apos;s demo won&apos;t open here.{' '}
            <a href="#personas" className="font-semibold text-primary underline">
              Pick a demo below
            </a>{' '}
            or log in to continue.
          </p>
        )}
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Every SIP needs a reason to keep going.</h1>
          <Link href={enter} scroll={false} className="mt-8 inline-flex min-h-12 items-center rounded-full bg-primary px-10 font-semibold text-white hover:bg-primary-hover">
            Get started
          </Link>
          <div>
            <TryDemoLink />
          </div>
        </section>

        <div className="mt-4">
          <HeroGoalMap />
        </div>

        <section id="personas" aria-labelledby="personas-title" className="mt-16 scroll-mt-6">
          <h2 id="personas-title" className="mb-4 text-center text-[22px] font-semibold">
            Try a demo
          </h2>
          <StartDemo demos={DEMOS} />
          <p className="mt-4 text-center text-sm text-muted">Made-up people and data · no real money · not investment advice.</p>
        </section>
      </main>

      <SiteFooter />
      <Suspense>
        <AuthModal />
      </Suspense>
    </>
  );
}
