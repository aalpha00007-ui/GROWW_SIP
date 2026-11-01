// Whether CI may reuse the committed eval/results.json instead of running the eval again (saving a day's worth of
// Groq's free tokens). Only when all of these hold; otherwise CI runs the live eval, as it always has:
// - the results record the fingerprint of the AI files, and it is the fingerprint of the code being deployed;
// - they were made with the models CI would use;
// - they passed, and still pass when the gate is worked out again from the file with today's rules.
// A forced run ("Run workflow", or "[run eval]" in the commit message) always calls the models.
import { DEFAULT_GROQ_MODEL, DEFAULT_MISTRAL_MODEL } from '../llm/chat';
import { summaryFromResults } from '../server/quality';
import type { Fingerprint } from './fingerprint';

export interface ReuseDecision {
  reuse: boolean;
  reason: string;
}

/** The reader and writer CI's eval would use: the same settings `npm run eval` reads. */
export function ciModels(env: Record<string, string | undefined> = process.env): string {
  return `${env.GROQ_MODEL || DEFAULT_GROQ_MODEL} + ${env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL}`;
}

export function reuseDecision(results: unknown, current: Fingerprint, models = ciModels()): ReuseDecision {
  const file = results as {
    passed?: unknown;
    run?: { id?: number; model?: string; ai_files?: Fingerprint | null };
  } | null;
  if (!file || typeof file !== 'object' || !file.run) return { reuse: false, reason: 'there is no committed eval/results.json' };
  const recorded = file.run.ai_files;
  if (!recorded?.hash) return { reuse: false, reason: `run #${file.run.id} has no fingerprint of the AI files (it was made before fingerprints)` };
  if (recorded.hash !== current.hash) {
    return { reuse: false, reason: `the AI files changed since run #${file.run.id} (fingerprint ${recorded.hash.slice(0, 12)}, now ${current.hash.slice(0, 12)})` };
  }
  if (file.run.model !== models) return { reuse: false, reason: `run #${file.run.id} used ${file.run.model}, but CI uses ${models}` };
  if (file.passed !== true) return { reuse: false, reason: `run #${file.run.id} did not pass the gate` };
  const summary = summaryFromResults(results as Parameters<typeof summaryFromResults>[0]);
  if (!summary.passed) {
    const failed = summary.rows.filter((r) => r.ok === false).map((r) => `${r.label} ${r.value}`).join('; ');
    return { reuse: false, reason: `run #${file.run.id} fails the gate when worked out again: ${failed}` };
  }
  const golden = summary.rows[0].value;
  return { reuse: true, reason: `run #${file.run.id} passed on these exact AI files (${current.files} files, fingerprint ${current.hash.slice(0, 12)}); golden set ${golden}` };
}
