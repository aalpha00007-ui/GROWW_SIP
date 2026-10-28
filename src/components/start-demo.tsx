'use client';
// The welcome screen's tick box and persona buttons (PRD F1). Nothing starts until the box is ticked.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface PersonaChoice {
  key: string;
  name: string;
  about: string;
}

export function StartDemo({ personas }: { personas: PersonaChoice[] }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(persona: string) {
    setStarting(persona);
    setError(null);
    const response = await fetch('/api/demo/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
    }).catch(() => null);
    if (response?.ok) {
      router.push('/dashboard');
      return;
    }
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? 'The demo could not start. Check your connection and try again.');
    setStarting(null);
  }

  return (
    <div className="space-y-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>
          <span className="font-semibold">Facts only. No investment advice.</span>
          <span className="block text-sm text-muted">I understand this is a case-study prototype with made-up data, and nothing here is investment advice.</span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {personas.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={!agreed || starting !== null}
            onClick={() => start(p.key)}
            className="flex min-h-11 flex-col items-start rounded-xl border border-line bg-surface p-5 text-left transition enabled:hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-bold text-primary">{starting === p.key ? 'Starting…' : `Start as ${p.name.split(',')[0]}`}</span>
            <span className="mt-1 text-sm font-medium">{p.name}</span>
            <span className="mt-1 text-sm text-muted">{p.about}</span>
          </button>
        ))}
      </div>
      {!agreed && <p className="text-sm text-muted">Tick the box above to start.</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
    </div>
  );
}
