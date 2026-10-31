// A SIP id that isn't in this visitor's demo, on the SIP page, Before you stop or the goal page: often a link
// copied from another demo, since every demo is a private copy with its own SIP ids.
import Link from 'next/link';

export default function SipNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <h1 className="text-2xl font-bold">This SIP isn&apos;t in your demo</h1>
      <p className="mt-2 text-muted">
        Every demo is a private copy with its own SIPs, so a link from someone else&apos;s demo won&apos;t open here.
      </p>
      <Link href="/sips" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-hover">
        See your SIPs
      </Link>
    </div>
  );
}
