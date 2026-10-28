// The landing page (PRD F1), after the layout reference with our own copy: the header with Log in / Sign up,
// the demo market strip, the headline and "Get started", the three feature cards, the disclaimer, and the
// ready-made demo personas. Signing up and logging in happen in the modal (?auth=signup | login).
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthModal } from '@/components/auth-modal';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { Logo } from '@/components/logo';
import { MarketStrip } from '@/components/market-strip';
import { StartDemo, type PersonaChoice } from '@/components/start-demo';
import { getDb } from '@/db/pool';
import { loadMarket, loadPersonas } from '@/pipeline/loading/raw';
import { marketStrip } from '@/server/market';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

const TABS = ['Stocks', 'F&O', 'Mutual Funds', 'More'];

export default async function Landing() {
  const visitor = await currentVisitor();
  const strip = await marketStrip(getDb(), visitor?.id ?? null);
  const personas: PersonaChoice[] = loadPersonas(loadMarket()).map((p) => ({ key: p.key, name: p.display_name, about: p.about }));
  // Signed out, every way into the app opens the sign-up modal.
  const enter = visitor ? '/explore' : '/?auth=signup';

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-2">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="GROWW_SIP home" className="flex min-h-11 items-center">
              <Logo />
            </Link>
            <nav aria-label="Products" className="hidden items-center gap-6 md:flex">
              {TABS.map((tab) => (
                <Link key={tab} href={enter} scroll={false} className="flex min-h-11 items-center text-lg font-medium text-muted hover:text-ink">
                  {tab}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={enter}
              scroll={false}
              className="hidden min-h-11 w-64 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted hover:border-primary lg:flex"
            >
              <Icon name="search" size={18} />
              Search mutual funds
            </Link>
            {visitor ? (
              <Link href="/explore" className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-strong hover:bg-hover-neutral">
                <Avatar name={visitor.firstName} />
                {visitor.firstName}
              </Link>
            ) : (
              <Link
                href="/?auth=login"
                scroll={false}
                className="flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Log in / Sign up
              </Link>
            )}
          </div>
        </div>
      </header>
      <MarketStrip strip={strip} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Every SIP needs a reason to keep going.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            This prototype lets first-time investors say what each SIP is for, shows that goal again when a market fall makes the SIP look red,
            and gives the facts about their own SIP before they stop it.
          </p>
          {visitor ? (
            <Link href="/explore" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-primary px-8 font-semibold text-white hover:bg-primary-hover">
              Continue as {visitor.firstName}
            </Link>
          ) : (
            <Link href="/?auth=signup" scroll={false} className="mt-8 inline-flex min-h-12 items-center rounded-full bg-primary px-8 font-semibold text-white hover:bg-primary-hover">
              Get started
            </Link>
          )}
          <HeroIllustration />
        </section>

        <ul className="mt-10 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ['Set a goal', 'Say what the money is for and by when, right where you start the SIP.'],
            ['See the dip in context', 'Your goal, time to go and months invested, next to today’s value.'],
            ['Check in before you stop', 'Tell us why in any language. Get the facts and your options; stopping stays one tap.'],
          ].map(([title, text]) => (
            <li key={title} className="rounded-xl border border-line bg-surface p-5">
              <p className="font-semibold text-strong">{title}</p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ul>

        <section className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          <p className="font-semibold text-ink">Before you start</p>
          <p className="mt-1">
            This is a student case-study prototype. It is not affiliated with Groww. All funds, prices and people are made up, no real money
            moves, and nothing here is investment advice. The AI only uses your demo SIP’s own numbers and links to the{' '}
            <a className="font-medium text-primary underline" href="https://investor.sebi.gov.in/index.html" target="_blank" rel="noreferrer">
              SEBI Investor Website
            </a>{' '}
            and{' '}
            <a className="font-medium text-primary underline" href="https://www.amfiindia.com" target="_blank" rel="noreferrer">
              AMFI
            </a>
            .
          </p>
        </section>

        <section id="personas" className="mt-12 scroll-mt-6">
          <h2 className="text-[22px] font-semibold">Or try a ready-made demo</h2>
          <p className="mb-4 text-sm text-muted">Each start gives you your own fresh copy, so nobody else sees your changes.</p>
          <StartDemo personas={personas} />
        </section>
      </main>
      <Suspense>
        <AuthModal />
      </Suspense>
    </>
  );
}

/** Our own drawing: monthly SIP steps climbing towards a goal flag. */
function HeroIllustration() {
  return (
    <svg viewBox="0 0 480 160" className="mx-auto mt-10 h-auto w-full max-w-xl" aria-hidden="true">
      <path d="M20 140h440" className="stroke-line" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={40 + i * 52} y={120 - i * 13} width="30" height={20 + i * 13} rx="6" className={i < 4 ? 'fill-logo-navy' : 'fill-logo-green'} opacity={0.35 + i * 0.09} />
      ))}
      <path d="M55 112 C 150 100, 230 78, 300 52 S 390 26, 420 22" fill="none" className="stroke-primary" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
      <path d="M420 22V2" className="stroke-strong" strokeWidth="3" strokeLinecap="round" />
      <path d="M420 3h30l-8 8 8 8h-30z" className="fill-primary" />
      <circle cx="420" cy="22" r="6" className="fill-surface stroke-primary" strokeWidth="3" />
    </svg>
  );
}
