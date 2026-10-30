'use client';
// Before you stop (PRD F7): reason chips or free text in any language, the AI card, and five options.
// Stop anyway is on screen from the start, the same size as Keep my SIP, and always one tap (PRD §3.4).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CheckInCard } from '@/server/checkin-card';
import type { SipView } from '@/server/sip';
import { CheckInCardView } from './checkin-card';
import { postJson } from './post-json';

const REASON_CHIPS = ['Markets are down', 'I need the money', 'Too much each month', 'Is this the right fund?'];
const REASON_MAX = 500;

interface Props {
  sipId: number;
  controls: SipView['controls'];
  pauseChoices: SipView['pauseChoices'];
  options: { key: string; label: string }[];
}

export function BeforeYouStop({ sipId, controls, pauseChoices, options }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [card, setCard] = useState<CheckInCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);

  async function ask(text: string) {
    if (!text.trim()) return;
    setAsking(true);
    setError(null);
    setCard(null);
    const result = await postJson<CheckInCard>('/api/ai/before-stop', { sipId, text });
    setAsking(false);
    if (result.ok) setCard(result.data);
    else setError(result.error);
  }

  /** Records the choice against the card (when there is one), then does it. */
  async function choose(key: string, pauseCount?: number) {
    if (key === 'pause' && pauseCount === undefined) {
      setPausing(!pausing);
      return;
    }
    setBusy(key);
    setError(null);
    if (card && key !== 'cancel') await postJson('/api/ai/choice', { aiCheckId: card.aiCheckId, choice: key });
    // Every choice but Stop anyway keeps the SIP going: the funnel counts it as kept.
    if (key !== 'cancel') void postJson('/api/events', { event: 'sip_kept', sipId, choice: key });
    const done = (did: string) => router.push(`/sips/${sipId}?did=${did}`);
    let result: Awaited<ReturnType<typeof postJson>> | null = null;
    if (key === 'keep') return done('keep');
    if (key === 'lower') return router.push(`/sips/${sipId}?change=amount`);
    if (key === 'skip') result = await postJson(`/api/sips/${sipId}/skip`);
    if (key === 'pause') result = await postJson(`/api/sips/${sipId}/pause`, { count: pauseCount });
    if (key === 'cancel') result = await postJson(`/api/sips/${sipId}/cancel`, { aiCheckId: card?.aiCheckId });
    if (result?.ok) return done(key === 'cancel' ? 'stop' : key);
    setBusy(null);
    setError(result?.error ?? 'That did not work. Try again.');
  }

  const available = (key: string) => (key === 'skip' ? controls.skip : key === 'pause' ? controls.pause : key === 'lower' ? controls.amount : true);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold">Why do you want to stop?</h2>
        <p className="text-sm text-muted">Optional. Tap a reason or write your own, in any language.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REASON_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={asking}
              onClick={() => {
                setReason(chip);
                void ask(chip);
              }}
              className="min-h-11 rounded-full border border-line px-4 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {chip}
            </button>
          ))}
        </div>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(reason);
          }}
        >
          <label htmlFor="reason" className="sr-only">
            Tell us why, in any language
          </label>
          <textarea
            id="reason"
            value={reason}
            maxLength={REASON_MAX}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us why, in any language"
            className="w-full rounded-lg border border-line p-3"
          />
          <p className="text-xs text-muted">Please don&apos;t share personal details such as PAN, phone or account numbers.</p>
          <button
            type="submit"
            disabled={asking || !reason.trim()}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
          >
            {asking ? 'Reading your reason…' : 'Send'}
          </button>
        </form>
      </section>

      <div aria-live="polite" className="space-y-3">
        {error && <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">{error}</p>}
        {card && <CheckInCardView card={card} />}
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold">Your options</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={busy !== null || !available(option.key)}
              aria-expanded={option.key === 'pause' ? pausing : undefined}
              onClick={() => choose(option.key)}
              // One style for all five: no option is pushed or played down.
              className="flex min-h-12 items-center justify-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === option.key ? 'One moment…' : option.label}
            </button>
          ))}
        </div>
        {pausing && (
          <div className="mt-3 space-y-2 rounded-lg bg-page p-3">
            <p className="text-sm font-semibold">Skip the next</p>
            {pauseChoices.map((choice) => (
              <button
                key={choice.count}
                type="button"
                disabled={busy !== null}
                onClick={() => choose('pause', choice.count)}
                className="flex min-h-11 w-full items-center rounded-lg border border-line bg-surface px-3 text-left text-sm hover:border-primary"
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}
        {(!controls.skip || !controls.pause) && <p className="mt-2 text-xs text-muted">Skip and pause are not available while this SIP is paused.</p>}
      </section>
    </div>
  );
}
