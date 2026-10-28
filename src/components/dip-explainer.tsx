'use client';
// "What does this dip mean for my goal?" (PRD F6): one tap explains the number with this SIP's own facts.
// Arriving from the Home goal card (?explain=dip) starts it straight away.
import { useEffect, useRef, useState } from 'react';
import type { CheckInCard } from '@/server/checkin-card';
import { CheckInCardView } from './checkin-card';
import { postJson } from './post-json';

export function DipExplainer({ sipId, autoStart }: { sipId: number; autoStart: boolean }) {
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<CheckInCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  async function explain() {
    setLoading(true);
    setError(null);
    const result = await postJson<CheckInCard>('/api/ai/is-normal', { sipId });
    setLoading(false);
    if (result.ok) setCard(result.data);
    else setError(result.error);
  }

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    box.current?.scrollIntoView({ block: 'start' });
    void explain(); // Once on arrival; the ref keeps a re-render from asking twice.
  }, [autoStart]);

  return (
    <div ref={box} className="scroll-mt-20 space-y-3">
      <button
        type="button"
        onClick={explain}
        disabled={loading}
        className="flex min-h-11 w-full items-center justify-center rounded-lg border border-primary px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? 'Looking at your SIP’s numbers…' : card ? 'Explain again' : 'What does this dip mean for my goal?'}
      </button>
      <div aria-live="polite">
        {error && <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">{error}</p>}
        {card && !loading && <CheckInCardView card={card} />}
      </div>
    </div>
  );
}
