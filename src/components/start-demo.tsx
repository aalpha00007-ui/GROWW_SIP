'use client';
// The landing page's three demo cards (PRD F1): one tap starts a fresh private copy of that persona. Also
// "or try a demo ↓", which glides down to them (a jump when the visitor prefers reduced motion), and startDemo,
// which the header's More menu and the calculators' sign-up modal use too.
import { useState } from 'react';
import type { Demo } from '@/server/demos';

/** Starting a demo gives up after this long, so the button never stays on "Starting…". */
const START_TIMEOUT_MS = 8_000;
export const START_FAILED = "Couldn't start the demo, try again.";

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

  async function start(persona: string) {
    setStarting(persona);
    setError(null);
    const failed = await startDemo(persona);
    // The button stays on "Starting…" while the dashboard loads.
    if (!failed) return loadWithSession('/dashboard');
    setError(failed);
    setStarting(null);
  }

  return (
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
              <span className="mt-4 font-semibold text-primary">{starting === d.key ? 'Starting…' : `Start as ${d.name.split(',')[0]} →`}</span>
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
  );
}

/** Starts a fresh private copy of a demo and signs this browser in to it. Returns an error to show, or null. */
export async function startDemo(persona: string): Promise<string | null> {
  const response = await fetch('/api/demo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
    signal: AbortSignal.timeout(START_TIMEOUT_MS),
  }).catch(() => null);
  if (response?.ok) return null;
  const body = (await response?.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? START_FAILED;
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
      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      or try a demo ↓
    </a>
  );
}
