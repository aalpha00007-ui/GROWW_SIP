'use client';
// Remove, on one cart item.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './post-json';

export function CartRemove({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    const result = await postJson(`/api/cart/${id}/remove`);
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      title={error ?? undefined}
      className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line px-4 text-sm font-semibold hover:border-loss hover:text-loss disabled:opacity-60 sm:flex-none"
    >
      {error ? 'Try again' : busy ? 'Removing…' : 'Remove'}
    </button>
  );
}
