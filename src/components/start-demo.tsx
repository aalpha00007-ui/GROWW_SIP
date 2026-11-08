'use client';
// The landing page's three demo cards (PRD F1): one tap starts a fresh private copy of that persona. Also
// "or try a demo ↓", which glides down to them (a jump when the visitor prefers reduced motion), and startDemo,
// which the header's More menu and the calculators' sign-up modal use too.
import { useState } from 'react';
import type { Demo } from '@/server/demos';

/**
 * Starting a demo gives up after this long, so the button never stays on "Starting…". Render's free server sleeps
 * when nobody uses it, and the first start after it wakes (Riya's most of all) can take well past 8 seconds.
 */
const START_TIMEOUT_MS = 30_000;
/** After this long the button says "Still starting…" and a line under the cards says why. */
const SLOW_AFTER_MS = 4_000;
export const START_FAILED = "Couldn't start the demo, try again.";
const WAKING = 'The free server can take up to a minute to wake up.';

/**
 * Opens a page after the session cookie changed (a demo started, a log-in, a log-out): a full page load, so
 * every part of the page reads the new cookie. A client push followed by a refresh could cancel the push and
 * leave the visitor on the old page.
 */
export function loadWithSession(href: string): void {
  window.location.assign(href);
}

export function StartDemo({ demos }: { demos: readonly Demo[] }) {
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  async function start(persona: string) {
    setStarting(persona);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const failed = await startDemo(persona);
    clearTimeout(slowTimer);
    // The button stays on "Starting…" (or "Still starting…") while the dashboard loads.
    if (!failed) return loadWithSession('/dashboard');
    setSlow(false);
    setError(failed);
    setStarting(null);
  }

  return (
    <>
      <div className="space-y-4">
        <ul className="grid gap-4 md:grid-cols-3">
          {demos.map((d) => (
            <li key={d.key}>
              <button
                type="button"
                disabled={starting !== null}
                onClick={() => start(d.key)}
                className="flex h-full min-h-11 w-full flex-col items-start rounded-xl border border-line bg-surface p-5 text-left transition enabled:hover:border-primary disabled:cursor-wait disabled:opacity-60"
              >
                <span className="font-semibold text-strong">{d.name}</span>
                <span className="mt-1 flex-1 text-sm text-muted">{d.about}</span>
                <span className="mt-4 font-semibold text-primary">
                  {starting === d.key ? (slow ? 'Still starting…' : 'Starting…') : `Start as ${d.name.split(',')[0]} →`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
            {error}
          </p>
        )}
      </div>
      {/* Always on the page, even when empty, so a screen reader reads the line out when it appears. It sits outside the
          spaced list above, so while it is empty it adds no gap under the cards. */}
      <p role="status" className={slow ? 'mt-4 text-center text-sm text-muted' : 'sr-only'}>
        {slow ? WAKING : ''}
      </p>
    </>
  );
}

/**
 * Starts a fresh private copy of a demo and signs this browser in to it. Returns an error to show, or null.
 * The session cookie comes only with a successful reply, so when this gives up, this browser is not signed in to the
 * new copy (even if the server went on to make it), and a second try is the right thing to ask for.
 */
export async function startDemo(persona: string): Promise<string | null> {
  const controller = new AbortController();
  // A plain timer rather than AbortSignal.timeout, so the regression tests' test clock can move it on.
  const timer = setTimeout(() => controller.abort(), START_TIMEOUT_MS);
  try {
    const response = await fetch('/api/demo/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona }),
      signal: controller.signal,
    }).catch(() => null);
    if (response?.ok) return null;
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? START_FAILED;
  } finally {
    clearTimeout(timer);
  }
}

export function TryDemoLink() {
  return (
    <a
      href="#personas"
      onClick={(e) => {
        const target = document.getElementById('personas');
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', '#personas');
      }}
      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2"
    >
      or try a demo ↓
    </a>
  );
}
