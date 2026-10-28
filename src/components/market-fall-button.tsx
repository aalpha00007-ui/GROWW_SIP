'use client';
// "Simulate a market fall" (PRD F12): a demo control so testers can create the dip themselves.
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function MarketFallButton() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const busy = sending || refreshing;

  async function fall() {
    setSending(true);
    setMessage(null);
    const response = await fetch('/api/demo/market-fall', { method: 'POST' }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { message?: string; error?: string } | null;
    setSending(false);
    if (response?.ok) {
      setMessage({ text: body?.message ?? 'Added a simulated market fall.', error: false });
      startRefresh(() => router.refresh());
    } else {
      setMessage({ text: body?.error ?? 'The market fall could not be added. Check your connection and try again.', error: true });
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-accent bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-accent-ink">Demo control</p>
      <p className="mt-1 text-sm text-muted">Adds a -6% day to every fund, for you only, so you can see a dip.</p>
      <button
        type="button"
        onClick={fall}
        disabled={busy}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-accent-tint px-3 text-sm font-bold text-accent-ink hover:bg-accent/20 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Adding the fall…' : 'Simulate a market fall'}
      </button>
      <p aria-live="polite" className={`text-sm empty:hidden ${message?.error ? 'mt-2 text-loss-ink' : 'mt-2 text-muted'}`}>
        {message?.text}
      </p>
    </section>
  );
}
