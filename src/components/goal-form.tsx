'use client';
// Set or edit a SIP's goal (spec §2A chips): what the money is for, and optionally by when.
// Nothing is preselected for a SIP without a goal, and "Not sure yet" is always a choice.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './post-json';

interface Props {
  sipId: number;
  kinds: { kind: string; label: string }[];
  current: { kind: string; name: string; targetMonth: string | null } | null;
  /** Quick picks ('Next year · Oct 2027') and every year for "Pick a year"; values are 'YYYY-MM'. */
  quickYears: { value: string; label: string }[];
  allYears: { value: string; label: string }[];
  nameMax: number;
}

const CHIP = 'min-h-11 rounded-full border px-4 text-sm font-medium';
const chipClass = (on: boolean) => `${CHIP} ${on ? 'border-brand bg-brand-tint text-brand' : 'border-line hover:border-brand'}`;

export function GoalForm({ sipId, kinds, current, quickYears, allYears, nameMax }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<string | null>(current?.kind ?? null);
  const [name, setName] = useState(current?.kind === 'custom' ? current.name : '');
  const [target, setTarget] = useState<string | null>(current?.targetMonth ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!kind) return;
    setSaving(true);
    setError(null);
    const body = kind === 'none' ? { kind } : { kind, name: kind === 'custom' ? name : undefined, targetMonth: target };
    const result = await postJson(`/api/sips/${sipId}/goal`, body);
    if (result.ok) {
      router.push(`/sips/${sipId}?did=goal`);
      router.refresh();
      return;
    }
    setSaving(false);
    setError(result.error);
  }

  const quick = quickYears.some((y) => y.value === target);

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-line bg-card p-4">
      <fieldset>
        <legend className="font-bold">What is this money for?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...kinds, { kind: 'none', label: 'Not sure yet' }].map((k) => (
            <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)} className={chipClass(kind === k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'custom' && (
          <div className="mt-3">
            <label htmlFor="goal-name" className="block text-sm font-semibold">
              Name your goal
            </label>
            <input
              id="goal-name"
              value={name}
              maxLength={nameMax}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example: Wedding, Bike, Trip"
              className="mt-1 min-h-11 w-full rounded-lg border border-line px-3"
            />
            <p className="mt-1 text-xs text-muted">Up to {nameMax} characters. No personal details.</p>
          </div>
        )}
      </fieldset>

      {kind && kind !== 'none' && (
        <fieldset>
          <legend className="font-bold">By when?</legend>
          <p className="text-sm text-muted">Optional.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickYears.map((y) => (
              <button key={y.value} type="button" aria-pressed={target === y.value} onClick={() => setTarget(y.value)} className={chipClass(target === y.value)}>
                {y.label}
              </button>
            ))}
            <button type="button" aria-pressed={target === null} onClick={() => setTarget(null)} className={chipClass(target === null)}>
              No date
            </button>
          </div>
          <label htmlFor="goal-year" className="mt-3 block text-sm font-semibold">
            Or pick a year
          </label>
          <select
            id="goal-year"
            value={target && !quick ? target : ''}
            onChange={(e) => setTarget(e.target.value || null)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 sm:w-60"
          >
            <option value="">Choose a year</option>
            {allYears.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-loss-tint px-3 py-2 text-sm text-loss-ink">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!kind || saving || (kind === 'custom' && !name.trim())}
        className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {saving ? 'Saving…' : 'Save goal'}
      </button>
    </form>
  );
}
