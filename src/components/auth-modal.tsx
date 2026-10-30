'use client';
// "Create or open your demo account": one modal for sign-up and log-in, opened by ?auth=signup or ?auth=login
// on the landing page. Step 1 asks only for a made-up username; step 2 asks for a 4-digit demo PIN, new or
// existing. Never an email, phone, Google or Apple sign-in, PAN, Aadhaar, bank detail or real password.
// Full screen on phones; Esc and × close it, and Tab stays inside while it is open. Opened from a calculator
// ("Start this SIP"), it also offers "Try as Kabir instead".
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FEATURE_TRIES } from '@/server/demos';
import { BANNER_TEXT } from './banner';
import { Logo } from './logo';
import { postJson } from './post-json';
import { startDemo } from './start-demo';

const ADJECTIVES = ['calm', 'brave', 'steady', 'bright', 'quiet', 'swift', 'kind', 'bold', 'lucky', 'sunny'];
const ANIMALS = ['tiger', 'heron', 'otter', 'falcon', 'panda', 'koel', 'lynx', 'robin', 'gecko', 'yak'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const PRIMARY_BUTTON = 'flex min-h-12 w-full items-center justify-center rounded-lg bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-60';

export function AuthModal() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = params.get('auth');
  const open = tab === 'signup' || tab === 'login';
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(() => {});
  close.current = () => router.replace(path, { scroll: false });

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      const box = dialog.current;
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!box.contains(document.activeElement)) {
        e.preventDefault();
        first?.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 sm:items-center sm:justify-center sm:p-4" onClick={() => close.current()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="flex h-dvh w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-2xl sm:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="bg-accent-tint px-4 py-1.5 text-center text-xs font-medium text-accent-ink">{BANNER_TEXT}</p>
        <div className="flex min-h-0 flex-1 md:min-h-[30rem]">
          <aside className="relative hidden w-2/5 flex-col justify-between overflow-hidden bg-primary p-8 text-white md:flex">
            <FlowingLines />
            <p className="relative mt-4 text-3xl font-bold leading-tight">Invest with a goal in mind.</p>
            <p className="relative text-sm text-white/90">Mutual funds · demo account</p>
          </aside>
          <div className="relative min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-3 sm:px-10">
            {/* The same logo as the header, level with the close button. */}
            <div className="mb-6 flex min-h-11 items-center pr-12">
              <Logo />
            </div>
            <button
              type="button"
              onClick={() => close.current()}
              aria-label="Close"
              className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-2xl text-muted hover:bg-hover-neutral"
            >
              ×
            </button>
            <AccountSteps />
            {path.startsWith('/calculators/') && <TryKabir />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** From a calculator: Kabir's demo instead of an account, on a fund page with the goal row. */
function TryKabir() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kabir = FEATURE_TRIES.find((t) => t.persona === 'kabir')!;

  async function start() {
    setBusy(true);
    setError(null);
    const failed = await startDemo(kabir.persona);
    if (failed) {
      setError(failed);
      setBusy(false);
      return;
    }
    router.push(kabir.href);
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" onClick={start} disabled={busy} className="flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-wait">
        {busy ? 'Starting Kabir’s demo…' : 'Try as Kabir instead'}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
          {error}
        </p>
      )}
    </div>
  );
}

type Step = { kind: 'username' } | { kind: 'create' | 'login'; username: string };

function AccountSteps() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'username' });
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  // A demo PIN is typed once and can't be reset, so it can be shown to check it.
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinBox = useRef<HTMLInputElement>(null);
  const usernameBox = useRef<HTMLInputElement>(null);
  const changeUsername = (name: string) => {
    setUsername(name);
    setError(null);
  };

  useEffect(() => {
    if (step.kind === 'username') usernameBox.current?.focus();
    else pinBox.current?.focus();
  }, [step.kind]);

  async function next(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postJson<{ exists: boolean }>('/api/auth/check', { username });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setPin('');
    setShowPin(false);
    setStep({ kind: result.data.exists ? 'login' : 'create', username: username.trim().toLowerCase() });
  }

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (step.kind === 'username') return;
    setBusy(true);
    setError(null);
    const result = await postJson(step.kind === 'create' ? '/api/auth/signup' : '/api/auth/login', { username: step.username, pin });
    if (result.ok) {
      router.push('/explore');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(result.error);
    setPin('');
    pinBox.current?.focus();
  }

  const alert = error && (
    <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
      {error}
    </p>
  );

  if (step.kind === 'username') {
    return (
      <form onSubmit={next} className="space-y-6">
        <h2 id="auth-title" className="text-2xl font-bold">
          Create or open your demo account
        </h2>
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="auth-username" className="text-sm font-semibold text-strong">
              Demo username
            </label>
            <button
              type="button"
              onClick={() => changeUsername(`${pick(ADJECTIVES)}-${pick(ANIMALS)}-${10 + Math.floor(Math.random() * 90)}`)}
              className="min-h-11 text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Suggest one
            </button>
          </div>
          <input
            ref={usernameBox}
            id="auth-username"
            value={username}
            onChange={(e) => changeUsername(e.target.value)}
            maxLength={20}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="auth-username-help"
            className="min-h-12 w-full border-0 border-b-2 border-line bg-transparent px-0 text-lg text-strong"
          />
          <p id="auth-username-help" className="mt-2 text-xs text-muted">
            3 to 20 letters, numbers, - or _.
          </p>
        </div>
        {alert}
        <div>
          <button type="submit" disabled={busy || username.trim().length === 0} className={PRIMARY_BUTTON}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <p className="mt-3 text-xs text-muted">Demo only. No real money. Don&apos;t use your real email, phone number or passwords.</p>
        </div>
      </form>
    );
  }

  const creating = step.kind === 'create';
  return (
    <form onSubmit={finish} className="space-y-6">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setStep({ kind: 'username' });
        }}
        className="-mt-2 flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        ← Change username
      </button>
      <div>
        <h2 id="auth-title" className="text-2xl font-bold">
          {creating ? 'Create a 4-digit demo PIN' : 'Enter your 4-digit PIN'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {creating ? 'New demo account' : 'Demo account'} <span className="font-semibold text-strong">{step.username}</span>
        </p>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <PinBoxes value={pin} onChange={setPin} inputRef={pinBox} creating={creating} shown={showPin} />
          <button type="button" onClick={() => setShowPin(!showPin)} className="min-h-11 text-sm font-semibold text-primary underline-offset-2 hover:underline">
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {creating ? "Remember it: demo PINs can't be reset." : "Forgot it? Demo PINs can't be reset. Change the username to make a new demo account."}
        </p>
      </div>
      {alert}
      <button type="submit" disabled={busy || pin.length !== 4} className={PRIMARY_BUTTON}>
        {busy ? (creating ? 'Creating…' : 'Logging in…') : creating ? 'Create account' : 'Log in'}
      </button>
    </form>
  );
}

/**
 * The PIN as four boxes. Under them is one real input (transparent, on top), so fast typing, paste and
 * password managers all work, and a screen reader hears one PIN field named by the heading.
 */
function PinBoxes({
  value,
  onChange,
  inputRef,
  creating,
  shown,
}: {
  value: string;
  onChange: (pin: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  creating: boolean;
  /** Show the digits instead of dots. */
  shown: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative w-fit">
      <div className="flex gap-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid size-14 place-items-center rounded-lg border-2 bg-surface text-3xl font-bold text-strong ${
              focused && i === Math.min(value.length, 3) ? 'border-primary' : 'border-line'
            }`}
          >
            {value[i] ? (shown ? value[i] : '•') : ''}
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoComplete={creating ? 'new-password' : 'current-password'}
        aria-labelledby="auth-title"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The highlighted box shows which digit comes next.
        className="absolute inset-0 size-full cursor-text text-base opacity-0"
      />
    </div>
  );
}

/** Our own pattern for the green panel: thin white lines flowing across it, like a calm market. */
function FlowingLines() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-20" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const y = 40 + i * 42;
        return <path key={i} d={`M-20 ${y} C 90 ${y - 70}, 210 ${y + 90}, 420 ${y - 30}`} fill="none" stroke="white" strokeWidth="1.2" />;
      })}
    </svg>
  );
}
