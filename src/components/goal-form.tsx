'use client';
// Set or edit a SIP's goal: the goal page, and the goal prompt after Start SIP (PRD F3), which adds
// "Maybe later". "Not sure yet" is always a choice.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { goalBody, GoalPicker, type GoalChoice, type GoalOptions } from './goal-picker';
import { postJson } from './post-json';

interface Props {
  sipId: number;
  options: GoalOptions;
  current: { kind: string; name: string; targetMonth: string | null } | null;
  /** The goal prompt's "Maybe later" link. */
  laterHref?: string;
}

export function GoalForm({ sipId, options, current, laterHref }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<GoalChoice>({
    kind: current?.kind ?? null,
    name: current?.kind === 'custom' ? current.name : '',
    target: current?.targetMonth ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const body = goalBody(choice);
    if (!body) return;
    setSaving(true);
    setError(null);
    const result = await postJson(`/api/sips/${sipId}/goal`, body);
    if (result.ok) {
      router.push(`/sips/${sipId}?did=goal`);
      router.refresh();
      return;
    }
    setSaving(false);
    setError(result.error);
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-line bg-card p-4">
      <GoalPicker value={choice} onChange={setChoice} options={options} idPrefix="goal" />
      {error && (
        <p role="alert" className="rounded-lg bg-loss-tint px-3 py-2 text-sm text-loss-ink">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!choice.kind || saving || (choice.kind === 'custom' && !choice.name.trim())}
          className="flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save goal'}
        </button>
        {laterHref && (
          <Link href={laterHref} className="flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-sm font-semibold hover:border-brand">
            Maybe later
          </Link>
        )}
      </div>
    </form>
  );
}
