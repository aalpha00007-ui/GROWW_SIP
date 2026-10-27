// Steps 4 and 7: the two model calls. A reply that cannot be read is an LlmError, so it ends in the fallback card.
import { LlmError, type Llm } from '../../llm/chat';
import type { ExplainerChunk } from '../chunking/explainers';
import type { FactsUnit } from '../chunking/facts';
import { BEHAVIOURS, THEMES, type Route } from '../loading/fixtures';
import { answerMessages, understandMessages, type Language, type Moment } from './prompts';

export type Theme = (typeof THEMES)[number];

export interface Understanding {
  primary_theme: Theme;
  themes: Theme[];
  behaviour: (typeof BEHAVIOURS)[number];
  asks_for_advice: boolean;
  misreads_cancel: boolean;
  language: Language;
  confidence: number;
  summary: string;
}

/** Step 4: JSON mode, temperature 0. A reply that breaks the schema gets one retry before the fallback card. */
export async function understand(llm: Llm | null, facts: FactsUnit, reason: string): Promise<Understanding> {
  const model = requireLlm(llm);
  const messages = understandMessages(facts, reason);
  let u: Understanding | undefined;
  try {
    u = parseUnderstanding(await model.complete(messages, { temperature: 0 }));
  } catch (err) {
    // Only a broken reply is retried; a timeout or HTTP error already took its time and goes to the fallback.
    if (!(err instanceof MalformedReply)) throw err;
  }
  u ??= parseUnderstanding(await model.complete(messages, { temperature: 0 }));
  return { ...u, language: scriptLanguage(reason, u.language) };
}

/**
 * Step 4 with its backup (architecture decision D4): the reader (Groq) reads the reason; if it fails or is out
 * of free requests, the backup (Mistral, which also writes the answer) reads it instead. No reader means the
 * backup reads. Returns the model that did the reading, for the log.
 */
export async function readReason(
  models: { reader?: Llm | null; backup: Llm | null },
  facts: FactsUnit,
  reason: string,
  log: (line: string) => void,
): Promise<{ understanding: Understanding; model: string }> {
  if (models.reader) {
    try {
      return { understanding: await understand(models.reader, facts, reason), model: models.reader.model };
    } catch (err) {
      if (!(err instanceof LlmError) || !models.backup) throw err;
      log(`Reader ${models.reader.model} failed (${err.message}); ${models.backup.model} reads the reason instead`);
    }
  }
  return { understanding: await understand(models.backup, facts, reason), model: models.backup?.model ?? 'none' };
}

/** The script settles Hindi against Hinglish: the model sometimes calls Hinglish in Latin letters "hi". */
export function scriptLanguage(reason: string, detected: Language): Language {
  return detected === 'hi' && !/[ऀ-ॿ]/.test(reason) ? 'hinglish' : detected;
}

/** Step 7: temperature 0.2, at most 90 words in the investor's language. */
export async function writeAnswer(
  llm: Llm | null,
  args: { route: Route; facts: FactsUnit; explainers: ExplainerChunk[]; language: Language; moment: Moment; reason: string },
): Promise<string> {
  const raw = await requireLlm(llm).complete(answerMessages(args), { temperature: 0.2 });
  const parsed = readJson(raw) as { text?: unknown };
  const text = typeof parsed.text === 'string' ? stripMarkdown(parsed.text) : '';
  if (text === '') throw new LlmError('Mistral returned an answer with no text');
  return text;
}

/** The card shows plain text, so markdown the model adds despite the prompt is removed before the checks run. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '') // headings
    .replace(/^[ \t]*(?:[-+•]|\d+[.)])[ \t]+/gm, '') // list markers; "*" bullets go with the other asterisks below
    .replace(/\*+|__|`/g, '') // bold, italic and code marks
    .replace(/[ \t]+/g, ' ')
    .replace(/^ | $/gm, '')
    .trim();
}

export function parseUnderstanding(raw: string): Understanding {
  const u = readJson(raw) as Record<string, unknown>;
  const isTheme = (t: unknown): t is Theme => (THEMES as readonly unknown[]).includes(t);
  const themes = Array.isArray(u.themes) ? u.themes : [];
  const valid =
    isTheme(u.primary_theme) &&
    themes.length >= 1 && themes.length <= 3 && themes.every(isTheme) &&
    (BEHAVIOURS as readonly unknown[]).includes(u.behaviour) &&
    typeof u.asks_for_advice === 'boolean' &&
    typeof u.misreads_cancel === 'boolean' &&
    ['en', 'hi', 'hinglish', 'other'].includes(u.language as string) &&
    typeof u.confidence === 'number' && u.confidence >= 0 && u.confidence <= 1 &&
    typeof u.summary === 'string';
  if (!valid) throw new MalformedReply('Mistral returned an understanding that does not match the schema');
  return {
    primary_theme: u.primary_theme as Theme,
    themes: themes as Theme[],
    behaviour: u.behaviour as Understanding['behaviour'],
    asks_for_advice: u.asks_for_advice as boolean,
    misreads_cancel: u.misreads_cancel as boolean,
    language: u.language as Language,
    confidence: u.confidence as number,
    summary: (u.summary as string).trim().split(/\s+/).slice(0, 20).join(' '),
  };
}

function requireLlm(llm: Llm | null): Llm {
  if (!llm) throw new LlmError('MISTRAL_API_KEY is not set');
  return llm;
}

/** The model answered, but not in the shape asked for. Still an LlmError, so it ends in the fallback card. */
class MalformedReply extends LlmError {}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new MalformedReply('Mistral returned text that is not JSON');
  }
}
