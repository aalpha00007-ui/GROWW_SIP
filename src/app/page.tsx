// Welcome (PRD F1): what this is, the disclaimers, the tick box, and Start as Riya / Arjun / Meera.
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { StartDemo, type PersonaChoice } from '@/components/start-demo';
import { currentVisitor } from '@/server/visitor';

export const dynamic = 'force-dynamic';

const PERSONAS: PersonaChoice[] = [
  { key: 'riya', name: 'Riya, 27, salaried', about: 'Three SIPs: one for a home, one for an emergency fund, one with no goal yet. Her home SIP is red after a market fall.' },
  { key: 'arjun', name: 'Arjun, 31, freelancer', about: 'Income varies. One midcap SIP for a home, with a month already skipped.' },
  { key: 'meera', name: 'Meera, 29, salaried', about: 'Two SIPs, both for retirement in 2056.' },
];

export default async function Welcome() {
  const visitor = await currentVisitor();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Logo className="text-lg" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Every SIP needs a reason to keep going.</h1>
      <p className="mt-3 text-muted">
        This prototype lets first-time investors say what each SIP is for, shows that goal again when a market fall makes the SIP look red,
        and gives the facts about their own SIP before they stop it.
      </p>

      <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ['Set a goal', 'Say what the money is for and by when, right where you start the SIP.'],
          ['See the dip in context', 'Your goal, time to go and months invested, next to today’s value.'],
          ['Check in before you stop', 'Tell us why in any language. Get the facts and your options; stopping stays one tap.'],
        ].map(([title, text]) => (
          <li key={title} className="rounded-xl border border-line bg-card p-4">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-muted">{text}</p>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-xl border border-line bg-card p-4 text-sm text-muted">
        <p className="font-semibold text-ink">Before you start</p>
        <p className="mt-1">
          This is a student case-study prototype. It is not affiliated with Groww. All funds, prices and people are made up, no real money
          moves, and nothing here is investment advice. The AI only uses your demo SIP’s own numbers and links to the{' '}
          <a className="font-medium text-brand underline" href="https://investor.sebi.gov.in/index.html" target="_blank" rel="noreferrer">
            SEBI Investor Website
          </a>{' '}
          and{' '}
          <a className="font-medium text-brand underline" href="https://www.amfiindia.com" target="_blank" rel="noreferrer">
            AMFI
          </a>
          .
        </p>
      </section>

      {visitor && (
        <Link
          href="/home"
          className="mt-6 flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white hover:opacity-90"
        >
          Continue as {visitor.firstName}
        </Link>
      )}

      <h2 className="mt-8 text-lg font-bold">{visitor ? 'Or start again as' : 'Choose a demo investor'}</h2>
      <p className="mb-4 text-sm text-muted">Each start gives you your own fresh copy, so nobody else sees your changes.</p>
      <StartDemo personas={PERSONAS} />
    </main>
  );
}
