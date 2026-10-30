'use client';
// Start one cart item. A SIP saved with a goal starts at once; one without opens the same goal step as
// the fund page (brief phase 4). A one-time item is invested from the demo balance. Either way the item
// leaves the cart.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EMPTY_GOAL, goalApiBody, GoalStep, type GoalDraft, type GoalStepOptions } from './goal-step';
import { postJson } from './post-json';

interface Props {
  item: { id: number; fundId: number; kind: 'sip' | 'one_time'; amountValue: number; day: number | null; goal: { body: unknown } | null };
  options: GoalStepOptions;
}

export function CartCheckout({ item, options }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSip(goal: unknown, goalStep: 'saved' | 'skipped') {
    setBusy(true);
    setError(null);
    const result = await postJson<{ id: number }>('/api/sips', {
      fundId: item.fundId,
      amount: item.amountValue,
      frequency: 'monthly',
      day: item.day,
      goal,
      goalStep,
      source: 'cart',
      cartItemId: item.id,
    });
    if (result.ok) {
      router.push(`/sips/${result.data.id}/started`);
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  async function go() {
    if (item.kind === 'sip') {
      if (item.goal) await startSip(item.goal.body, 'saved');
      else setOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await postJson('/api/invest', { fundId: item.fundId, amount: item.amountValue, cartItemId: item.id });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        title={error ?? undefined}
        className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 sm:flex-none"
      >
        {busy && !open ? 'Please wait…' : item.kind === 'sip' ? 'Start SIP' : 'Invest'}
      </button>
      {error && !open && (
        <p role="alert" className="w-full rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
      {item.kind === 'sip' && (
        <GoalStep
          open={open}
          mode="start"
          fundId={item.fundId}
          amount={item.amountValue}
          day={item.day ?? 1}
          options={options}
          initial={EMPTY_GOAL}
          where="cart"
          busy={busy}
          error={error}
          onSave={(goal: GoalDraft) => void startSip(goalApiBody(goal), 'saved')}
          onSkip={() => void startSip(null, 'skipped')}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}
