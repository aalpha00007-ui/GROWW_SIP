'use client';
// What a calculator hands to the SIP setup: "Start this SIP" has no fund yet, so the amount (and the Goal planner's
// target and date) wait in this tab while the investor picks one, through sign-up if need be. Only a convenience:
// if the browser blocks storage, the setup simply starts empty.
import { useEffect, useState } from 'react';

export interface SipDraft {
  /** Rupees a month. */
  amount: number;
  /** From the Goal planner. */
  target?: number;
  /** 'MM' and 'YYYY'. */
  month?: string;
  year?: string;
}

const KEY = 'groww-sip-draft';

export function saveSipDraft(draft: SipDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage is blocked: the setup starts empty.
  }
}

export function readSipDraft(): SipDraft | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as SipDraft | null;
    return draft && Number.isFinite(draft.amount) ? draft : null;
  } catch {
    return null;
  }
}

export function clearSipDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The draft, read after mounting: the server can't see this tab's storage. */
export function useSipDraft(): [SipDraft | null, () => void] {
  const [draft, setDraft] = useState<SipDraft | null>(null);
  useEffect(() => setDraft(readSipDraft()), []);
  return [
    draft,
    () => {
      clearSipDraft();
      setDraft(null);
    },
  ];
}

const INR = new Intl.NumberFormat('en-IN');

/** On the fund lists: what the calculator handed over, until a SIP starts or the investor clears it. */
export function SipDraftNote() {
  const [draft, clear] = useSipDraft();
  if (!draft) return null;
  const goal = draft.target ? ` for your ₹${INR.format(draft.target)} goal` : '';
  return (
    <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-soft px-4 py-2 text-sm text-primary">
      <span>
        From your calculator: ₹{INR.format(draft.amount)} a month{goal}. Pick a fund and it will be filled in.
      </span>
      <button type="button" onClick={clear} className="min-h-11 font-semibold underline underline-offset-2">
        Clear
      </button>
    </p>
  );
}
