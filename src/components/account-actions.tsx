'use client';
// Log out, and "Delete my demo account" (two taps: it deletes the account and all its data).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './post-json';

export function LogOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await postJson('/api/auth/logout');
        router.push('/');
        router.refresh();
      }}
      className={className}
    >
      Log out
    </button>
  );
}

export function DeleteAccount({ isAccount }: { isAccount: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = isAccount ? 'Delete my demo account' : 'End this demo and delete its data';

  async function remove() {
    setBusy(true);
    const result = await postJson('/api/account/delete');
    if (result.ok) {
      router.push('/');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="space-y-3 rounded-lg bg-loss-soft p-4">
          <p className="text-sm text-loss-strong">This deletes {isAccount ? 'your demo account' : 'this demo copy'}, its SIPs, goals and history. It cannot be undone.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={remove} className="flex min-h-11 items-center rounded-lg border border-loss bg-surface px-4 text-sm font-semibold text-loss hover:text-loss-strong disabled:opacity-60">
              {busy ? 'Deleting…' : 'Yes, delete everything'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold">
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="flex min-h-11 items-center rounded-lg border border-loss px-4 text-sm font-semibold text-loss hover:bg-loss-soft hover:text-loss-strong">
          {label}
        </button>
      )}
      {error && <p className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">{error}</p>}
    </div>
  );
}
