'use client';
// The SIP page's controls (PRD F5): Skip next, Change amount, Pause and Stop SIP, all the same size.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SipView } from '@/server/sip';
import { postJson } from './post-json';

type Props = Pick<SipView, 'id' | 'controls' | 'status' | 'skipLabel' | 'skipConfirm' | 'undoable' | 'resumeNote' | 'pauseChoices' | 'amountNow' | 'minAmount' | 'maxAmount' | 'amountRange'> & {
  /** Open the amount form on arrival, for "Lower amount" at Before you stop. */
  openAmount: boolean;
  /** Open the pause choices on arrival, for Pause on the SIPs tab. */
  openPause?: boolean;
  /** The check-in "Lower amount" came from: its choice is recorded once the amount is saved. */
  checkId?: number;
};

const BUTTON = 'flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3 text-sm font-semibold hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';

export function SipControls({ id, controls, status, skipLabel, skipConfirm, undoable, resumeNote, pauseChoices, amountNow, minAmount, maxAmount, amountRange, openAmount, openPause = false, checkId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<'amount' | 'pause' | 'skip' | null>(
    openAmount && controls.amount ? 'amount' : openPause && controls.pause ? 'pause' : null,
  );
  const [amount, setAmount] = useState(String(amountNow));
  const [pauseCount, setPauseCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function act(path: string, body: unknown = {}, onDone?: () => void) {
    setBusy(true);
    setMessage(null);
    const result = await postJson(`/api/sips/${id}/${path}`, body);
    setBusy(false);
    if (result.ok) {
      setMessage({ text: result.data.message ?? 'Done.', error: false });
      onDone?.();
      setOpen(null);
      router.refresh();
    } else {
      setMessage({ text: result.error, error: true });
    }
  }

  /** The amount error goes as soon as the amount is right, not at the next Save. */
  function changeAmount(next: string) {
    setAmount(next);
    const value = Number(next);
    if (message?.error && Number.isInteger(value) && value >= minAmount && value <= maxAmount) setMessage(null);
  }

  function saveAmount(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    // Checked here for kindness; the API checks again (spec §5).
    if (!Number.isInteger(value) || value < minAmount || value > maxAmount) {
      setMessage({ text: `Enter a whole amount. ${amountRange}.`, error: true });
      return;
    }
    void act('amount', { amount: value }, () => {
      // Lower amount at Before you stop counts here, after the save. Opening the form counted for nothing.
      if (!openAmount) return;
      if (checkId) void postJson('/api/ai/choice', { aiCheckId: checkId, choice: 'lower' });
      void postJson('/api/events', { event: 'sip_kept', sipId: id, choice: 'lower' });
    });
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-bold">Manage this SIP</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <button type="button" className={BUTTON} disabled={busy || !controls.skip} aria-expanded={open === 'skip'} onClick={() => setOpen(open === 'skip' ? null : 'skip')}>
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
        {/* Destructive, so red, but the same size as the others and one tap to Before you stop. */}
        {controls.stop && (
          <Link
            href={`/sips/${id}/stop`}
            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-loss bg-surface px-3 text-sm font-semibold text-loss hover:bg-loss-soft hover:text-loss-strong"
          >
            Stop SIP
          </Link>
        )}
      </div>

      {status === 'paused' && (
        <div className="mt-4 rounded-lg bg-accent-tint p-3">
          <p className="text-sm text-accent-ink">{resumeNote}</p>
          <button type="button" disabled={busy} onClick={() => act('resume')} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            Resume now
          </button>
        </div>
      )}

      {undoable.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Scheduled skips">
          {undoable.map((skip) => (
            <li key={skip.due} className="flex items-center justify-between gap-3 rounded-lg bg-page px-3 py-1 text-sm">
              <span>Scheduled skip: {skip.date}</span>
              <button type="button" disabled={busy} onClick={() => act('undo-skip', { dueOn: skip.due })} className="min-h-11 shrink-0 font-semibold text-primary underline underline-offset-2 hover:text-primary-hover disabled:opacity-60">
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}

      {open === 'skip' && (
        <div className="mt-4 space-y-2 rounded-lg bg-page p-3">
          <p className="text-sm">{skipConfirm}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => act('skip')} className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
              Yes, skip it
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(null)} className="flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:border-primary">
              Keep it
            </button>
          </div>
        </div>
      )}

      {open === 'amount' && (
        // noValidate: the browser's own bubble would stop the form before our message, which says the range and clears itself.
        <form id="amount" noValidate onSubmit={saveAmount} className="mt-4 space-y-2 rounded-lg bg-page p-3">
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
            onChange={(e) => changeAmount(e.target.value)}
            className="tabular min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          />
          <p className="text-xs text-muted">{amountRange}. It applies from the next instalment.</p>
          <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
            Save amount
          </button>
        </form>
      )}

      {open === 'pause' && (
        <fieldset className="mt-4 space-y-2 rounded-lg bg-page p-3">
          <legend className="text-sm font-semibold">Skip the next</legend>
          {pauseChoices.map((choice) => (
            <label key={choice.count} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 text-sm">
              <input type="radio" name="pause" checked={pauseCount === choice.count} onChange={() => setPauseCount(choice.count)} className="size-4 accent-primary" />
              {choice.label}
            </label>
          ))}
          <button
            type="button"
            disabled={busy || pauseCount === null}
            onClick={() => act('pause', { count: pauseCount })}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            Pause
          </button>
        </fieldset>
      )}

      <p aria-live="polite" className={`text-sm empty:hidden ${message?.error ? 'mt-3 rounded-lg bg-loss-soft px-3 py-2 text-loss-strong' : 'mt-3 text-ink'}`}>
        {message?.text}
      </p>
    </section>
  );
}
