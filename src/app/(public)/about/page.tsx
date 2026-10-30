// About this prototype: what's demo, what we store (db/schema.sql), and how to delete it.
import type { Metadata } from 'next';
import Link from 'next/link';
import { SESSION_DAYS } from '@/server/auth';

export const metadata: Metadata = { title: 'About this prototype · Groww prototype' };

const H2 = 'text-xl font-bold';
const LIST = 'mt-3 list-disc space-y-2 pl-5';

export default function About() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 text-ink">
      <header>
        <h1 className="text-3xl font-bold">About this prototype</h1>
        <p className="mt-2 text-lg text-muted">
          A student case study about first-year SIP investors who stop after a market fall. It adds a goal to each SIP, shows a dip next to that goal,
          and checks in before a SIP is stopped. It is not made by or affiliated with Groww.
        </p>
      </header>

      <section>
        <h2 className={H2}>What&apos;s demo</h2>
        <p className="mt-3">
          Everything. The funds, prices, people, balances and orders are made up, no money moves, and nothing here is investment advice.
        </p>
      </section>

      <section>
        <h2 className={H2}>What we store</h2>
        <ul className={LIST}>
          <li>
            <b>For a demo account:</b> the username you make up and a hashed version of your 4-digit PIN. The PIN itself is never stored.
          </li>
          <li>
            <b>Demo activity:</b> the SIPs, goals and orders you make, the reasons you type at Before you stop with the AI&apos;s replies (
            <Link href="/about/ai" className="font-semibold text-primary underline underline-offset-2">
              how the AI works
            </Link>
            ), and simple events such as &ldquo;goal saved&rdquo;, with no free text.
          </li>
          <li>
            <b>To keep you signed in:</b> a cookie with a random token, for {SESSION_DAYS} days. We keep only a hash of the token.
          </li>
          <li>
            <b>For the sign-up limit:</b> a salted hash of your network address, never the address itself.
          </li>
        </ul>
        <p className="mt-3">
          We never ask for an email, phone number, Google or Apple sign-in, PAN, Aadhaar, bank or card details, or a real password.
        </p>
      </section>

      <section>
        <h2 className={H2}>How to delete it</h2>
        <p className="mt-3">
          Open <b>Settings</b> from the menu under your name and choose <b>Delete my demo account</b> (in a demo such as Kabir&apos;s, <b>End this demo and
          delete its data</b>). It deletes the account and everything in it: SIPs, goals, orders, check-ins and history. It cannot be undone.
        </p>
      </section>
    </article>
  );
}
