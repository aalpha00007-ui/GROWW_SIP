'use client';
// "Create demo account" and "Log in" (two panels after the layout reference, our own content). A display
// name, a username and a made-up 4-digit PIN: never an email, phone, Google or Apple sign-in, PAN, Aadhaar,
// bank detail or real password. Opened by ?auth=signup or ?auth=login on the landing page.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BANNER_TEXT } from './banner';
import { LogoMark } from './logo';
import { postJson } from './post-json';

const ADJECTIVES = ['calm', 'brave', 'steady', 'bright', 'quiet', 'swift', 'kind', 'bold', 'lucky', 'sunny'];
const ANIMALS = ['tiger', 'heron', 'otter', 'falcon', 'panda', 'koel', 'lynx', 'robin', 'gecko', 'yak'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

const INPUT = 'mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3';
const LABEL = 'block text-sm font-semibold text-strong';
const HELP = 'mt-1 text-xs text-muted';

export function AuthModal() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = params.get('auth');
  const open = tab === 'signup' || tab === 'login';
  const close = () => router.replace(path, { scroll: false });
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Re-run when the dialog opens or switches tab; close only changes the URL.
  }, [open, tab]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={tab === 'signup' ? 'Create demo account' : 'Log in'}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="bg-accent-tint px-4 py-1.5 text-center text-xs font-medium text-accent-ink">{BANNER_TEXT}</p>
        <div className="flex min-h-0 flex-1">
          <aside className="relative hidden w-2/5 flex-col justify-between overflow-hidden bg-primary p-8 text-white md:flex">
            <BarsPattern />
            <div className="relative">
              <LogoMark size={36} light />
              <p className="mt-6 text-2xl font-bold leading-snug">Practise SIP investing with demo money.</p>
            </div>
            <p className="relative text-sm text-white/90">Case-study prototype · no real money</p>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <div role="tablist" aria-label="Account" className="flex gap-6 border-b border-line">
                {(['signup', 'login'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => router.replace(`${path}?auth=${t}`, { scroll: false })}
                    className={`min-h-11 border-b-[3px] text-sm font-semibold ${tab === t ? 'border-strong text-strong' : 'border-transparent text-muted hover:text-ink'}`}
                  >
                    {t === 'signup' ? 'Create demo account' : 'Log in'}
                  </button>
                ))}
              </div>
              <button type="button" onClick={close} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full text-2xl text-muted hover:bg-hover-neutral">
                ×
              </button>
            </div>
            {tab === 'signup' ? <SignUpForm /> : <LogInForm onPersona={() => router.replace('/#personas')} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: '', username: '', pin: '', pinConfirm: '', agreed: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: key === 'agreed' ? e.target.checked : key.startsWith('pin') ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postJson('/api/auth/signup', form);
    if (result.ok) {
      router.push('/explore');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label htmlFor="su-name" className={LABEL}>
          Display name
        </label>
        <input id="su-name" value={form.displayName} onChange={set('displayName')} maxLength={20} autoComplete="off" className={INPUT} />
        <p className={HELP}>Doesn&apos;t need to be your real name.</p>
      </div>
      <div>
        <label htmlFor="su-user" className={LABEL}>
          Username
        </label>
        <div className="flex gap-2">
          <input id="su-user" value={form.username} onChange={set('username')} maxLength={20} autoComplete="off" className={INPUT} />
          <button
            type="button"
            onClick={() => setForm({ ...form, username: `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${10 + Math.floor(Math.random() * 90)}` })}
            className="mt-1 min-h-11 shrink-0 rounded-lg border border-line px-3 text-sm font-semibold text-primary hover:border-primary"
          >
            Suggest one
          </button>
        </div>
        <p className={HELP}>3 to 20 letters, numbers, - or _.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="su-pin" className={LABEL}>
            4-digit demo PIN
          </label>
          <input id="su-pin" type="password" inputMode="numeric" autoComplete="new-password" value={form.pin} onChange={set('pin')} className={`${INPUT} tabular tracking-widest`} />
        </div>
        <div>
          <label htmlFor="su-pin2" className={LABEL}>
            Confirm PIN
          </label>
          <input id="su-pin2" type="password" inputMode="numeric" autoComplete="new-password" value={form.pinConfirm} onChange={set('pinConfirm')} className={`${INPUT} tabular tracking-widest`} />
        </div>
      </div>
      <p className={HELP}>Make up a new PIN. Don&apos;t reuse any real PIN or password.</p>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" checked={form.agreed} onChange={set('agreed')} className="mt-0.5 size-5 shrink-0 accent-primary" />
        I understand this is a demo: no real money, no real details.
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !form.agreed} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
        {busy ? 'Creating…' : 'Create demo account'}
      </button>
    </form>
  );
}

function LogInForm({ onPersona }: { onPersona: () => void }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postJson('/api/auth/login', { username, pin });
    if (result.ok) {
      router.push('/explore');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div>
        <label htmlFor="li-user" className={LABEL}>
          Username
        </label>
        <input id="li-user" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="username" className={INPUT} />
      </div>
      <div>
        <label htmlFor="li-pin" className={LABEL}>
          4-digit demo PIN
        </label>
        <input
          id="li-pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className={`${INPUT} tabular tracking-widest`}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <button type="button" onClick={onPersona} className="mx-auto flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-2">
        Try a demo persona instead
      </button>
    </form>
  );
}

/** A faint pattern of our bars mark on the green panel. */
function BarsPattern() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-10" aria-hidden="true">
      <defs>
        <pattern id="bars" width="56" height="56" patternUnits="userSpaceOnUse">
          <rect x="10" y="30" width="7" height="12" rx="2.5" fill="white" />
          <rect x="20" y="24" width="7" height="18" rx="2.5" fill="white" />
          <rect x="30" y="17" width="7" height="25" rx="2.5" fill="white" />
          <circle cx="33.5" cy="11" r="2.5" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bars)" />
    </svg>
  );
}
