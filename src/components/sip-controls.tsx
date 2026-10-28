'use client';
// The SIP page's controls (PRD F5): Skip next, Change amount and Pause, with Stop SIP as a text link.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SipView } from '@/server/sip';
import { postJson } from './post-json';

type Props = Pick<SipView, 'id' | 'controls' | 'skipLabel' | 'pauseChoices' | 'amountNow' | 'minAmount' | 'maxAmount' | 'amountRange'> & {
  /** Open the amount form on arrival, for "Lower amount" at Before you stop. */
  openAmount: boolean;
};

const BUTTON = 'flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3 text-sm font-semibold hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50';

export function SipControls({ id, controls, skipLabel, pauseChoices, amountNow, minAmount, maxAmount, amountRange, openAmount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<'amount' | 'pause' | null>(openAmount && controls.amount ? 'amount' : null);
  const [amount, setAmount] = useState(String(amountNow));
  const [pauseCount, setPauseCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setMessage(null);
    const result = await postJson(`/api/sips/${id}/${path}`, body);
    setBusy(false);
    if (result.ok) {
      setMessage({ text: result.data.message ?? 'Done.', error: false });
      setOpen(null);
      router.refresh();
    } else {
      setMessage({ text: result.error, error: true });
    }
  }

  function saveAmount(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    // Checked here for kindness; the API checks again (spec §5).
    if (!Number.isInteger(value) || value < minAmount || value > maxAmount) {
      setMessage({ text: `Enter a whole amount. ${amountRange}.`, error: true });
      return;
    }
    void act('amount', { amount: value });
  }

  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="font-bold">Manage this SIP</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <div>
          <button type="button" className={BUTTON} disabled={busy || !controls.skip} onClick={() => act('skip')}>
            Skip next
          </button>
          {skipLabel && controls.skip && <p className="mt-1 text-center text-xs text-muted">{skipLabel}</p>}
        </div>
        <button type="button" className={BUTTON} disabled={busy || !controls.amount} aria-expanded={open === 'amount'} onClick={() => setOpen(open === 'amount' ? null : 'amount')}>
          Change amount
        </button>
        <button type="button" className={BUTTON} disabled={busy || !controls.pause} aria-expanded={open === 'pause'} onClick={() => setOpen(open === 'pause' ? null : 'pause')}>
          Pause
        </button>
      </div>

      {open === 'amount' && (
        <form id="amount" onSubmit={saveAmount} className="mt-4 space-y-2 rounded-lg bg-ground p-3">
          <label htmlFor="sip-amount" className="block text-sm font-semibold">
            New amount a month (Rs)
          </label>
          <input
            id="sip-amount"
            type="number"
            inputMode="numeric"
            min={minAmount}
            max={maxAmount}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular min-h-11 w-full rounded-lg border border-line bg-card px-3"
          />
          <p className="text-xs text-muted">{amountRange}. It applies from the next instalment.</p>
          <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-white disabled:opacity-60">
            Save amount
          </button>
        </form>
      )}

      {open === 'pause' && (
        <fieldset className="mt-4 space-y-2 rounded-lg bg-ground p-3">
          <legend className="text-sm font-semibold">Skip the next</legend>
          {pauseChoices.map((choice) => (
            <label key={choice.count} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-card px-3 text-sm">
              <input type="radio" name="pause" checked={pauseCount === choice.count} onChange={() => setPauseCount(choice.count)} className="size-4 accent-brand" />
              {choice.label}
            </label>
          ))}
          <button
            type="button"
            disabled={busy || pauseCount === null}
            onClick={() => act('pause', { count: pauseCount })}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Pause
          </button>
        </fieldset>
      )}

      <p aria-live="polite" className={`text-sm empty:hidden ${message?.error ? 'mt-3 text-loss-ink' : 'mt-3 text-gain-ink'}`}>
        {message?.text}
      </p>

      {controls.stop && (
        <p className="mt-4 text-center">
          <Link href={`/sips/${id}/stop`} className="inline-flex min-h-11 items-center text-sm text-muted underline hover:text-ink">
            Stop SIP
          </Link>
        </p>
      )}
    </section>
  );
}
