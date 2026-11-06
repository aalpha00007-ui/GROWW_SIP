'use client';
// Add or edit a SIP's goal on the goal page, with the same editor the goal step uses. The saved goal is filled in,
// so changing one field never loses another.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GoalEditor, goalApiBody, GoalGapNote, goalProblems, type GoalDraft, type GoalEditorOptions, type GoalGapLines } from './goal-editor';
import { postJson } from './post-json';

interface Props {
  sipId: number;
  options: GoalEditorOptions;
  /** The saved goal, or null when the SIP has none. */
  current: GoalDraft | null;
}

export function GoalForm({ sipId, options, current }: Props) {
  const router = useRouter();
  const [goal, setGoal] = useState<GoalDraft>(current ?? { kind: '', name: '', month: '', year: '', targetAmount: '' });
  const [saving, setSaving] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gap, setGap] = useState<GoalGapLines | null>(null);
  const problems = goalProblems(goal, options, { dateRequired: false });

  // The gap to the target, worked out by the server on this SIP's own schedule, as the date and target change.
  const previewable = problems.dated && !problems.date && !problems.target && goal.targetAmount !== '';
  useEffect(() => {
    if (!previewable) {
      setGap(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ targetMonth: `${goal.year}-${goal.month}`, target: goal.targetAmount });
      const response = await fetch(`/api/sips/${sipId}/goal-preview?${query}`, { signal: controller.signal }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { gap?: GoalGapLines | null } | null;
      if (body) setGap(body.gap ?? null);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [previewable, sipId, goal.year, goal.month, goal.targetAmount]);

  async function send(body: unknown, action: 'save' | 'remove') {
    setSaving(action);
    setError(null);
    const result = await postJson(`/api/sips/${sipId}/goal`, body);
    if (result.ok) {
      router.push(`/sips/${sipId}?did=${action === 'save' ? 'goal' : 'goal_removed'}`);
      router.refresh();
      return;
    }
    setSaving(null);
    setError(result.error);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (problems.ok) void send(goalApiBody(goal), 'save');
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-line bg-surface p-4">
      <GoalEditor value={goal} onChange={setGoal} options={options} idPrefix="goal" dateRequired={false} kindsLegend="What is this money for?" />
      <div aria-live="polite" className="text-sm empty:hidden">
        {gap && (
          <div className="rounded-lg bg-primary-soft px-4 py-3">
            <GoalGapNote gap={gap} />
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!problems.ok || saving !== null}
          className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {saving === 'save' ? 'Saving…' : 'Save goal'}
        </button>
        {current && (
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => void send({ kind: 'none' }, 'remove')}
            className="flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-sm font-semibold hover:border-primary disabled:opacity-60"
          >
            {saving === 'remove' ? 'Removing…' : 'Remove goal'}
          </button>
        )}
      </div>
    </form>
  );
}
