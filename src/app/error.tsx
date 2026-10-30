'use client';
// Any page that fails to load (the free demo database waking up, say): a calm message, the same logo, and a way to
// try again instead of the framework's bare "Application error".
import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted">This page couldn&apos;t load. The demo may be waking up, so try again in a moment.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-hover">
            Try again
          </button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-line px-5 font-semibold text-strong hover:border-primary">
            Home page
          </Link>
        </div>
      </main>
    </>
  );
}
