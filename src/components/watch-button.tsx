'use client';
// The fund page's watchlist button: adds the fund to Mutual Funds -> Watchlist, or takes it off.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from './icons';
import { postJson } from './post-json';

export function WatchButton({ fundId, watched }: { fundId: number; watched: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(watched);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await postJson<{ watched: boolean }>('/api/watchlist', { fundId, watch: !on });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOn(result.data.watched);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-60 ${
          on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-strong hover:border-primary'
        }`}
      >
        <Icon name="star" size={18} className={on ? 'fill-current' : ''} />
        {on ? 'In watchlist' : 'Add to watchlist'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-loss-strong">
          {error}
        </p>
      )}
    </div>
  );
}
