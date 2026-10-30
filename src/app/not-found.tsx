// Any page that doesn't exist (or a fund or SIP id that isn't there): the same logo as every header, and a way home.
import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-2">
          <Link href="/" aria-label="Groww prototype home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted">This page isn&apos;t part of the prototype.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-hover">
          Go to the home page
        </Link>
      </main>
    </>
  );
}
