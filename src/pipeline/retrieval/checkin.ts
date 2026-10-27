import type { Db } from '../../db/client';
import { LlmError, type Llm } from '../../llm/chat';
import { loadExplainerChunks, type ExplainerChunk } from '../chunking/explainers';
import type { FactsUnit } from '../chunking/facts';
import { numberTokens } from '../chunking/format';
import { todayInIndia } from '../loading/dates';
import { loadAdvicePatterns, type AdvicePattern, type Outcome, type Route } from '../loading/fixtures';
import { readReason, writeAnswer, type Understanding } from './ai';
import { allPassed, runChecks, type QualityChecks } from './checks';
import { decideRoute } from './decide';
import { retrieveFacts } from './facts';
import { findPii, PII_MESSAGE } from './pii';
import { DEFAULT_PROMPT_VERSION, ROUTE_EXPLAINERS, type Language, type Moment } from './prompts';

export const DECLINED_TEXT =
  "I can't recommend funds or tell you to buy, sell or switch. Here are the facts about your SIP and official places to learn more.";
export const FALLBACK_TEXT = "I couldn't give a reliable answer here.";

/** Shown on every card. Stop anyway is always there and always one tap (PRD §3.4). */
export const OPTIONS = [
  { key: 'skip', label: 'Skip next' },
  { key: 'lower', label: 'Lower amount' },
  { key: 'pause', label: 'Pause' },
  { key: 'keep', label: 'Keep my SIP' },
  { key: 'cancel', label: 'Stop anyway' },
] as const;
export type Choice = (typeof OPTIONS)[number]['key'];

export const OFFICIAL_LINKS = [
  { label: 'SEBI Investor Website', url: 'https://investor.sebi.gov.in/index.html' },
  { label: 'AMFI', url: 'https://www.amfiindia.com' },
] as const;

export interface CheckInInput {
  /** From the visitor's cookie. */
  investorId: string;
  sipId: number;
  moment: Moment;
  /** The reason, for before_stop; ignored for is_this_normal. */
  text?: string;
}

export interface CheckInDeps {
  db: Db;
  /** Mistral: writes the answer, and reads the reason when there is no reader. Null when no MISTRAL_API_KEY is set. */
  llm: Llm | null;
  /** Groq: reads the reason (call 1), with Mistral as its backup. Absent when no GROQ_API_KEY is set. */
  reader?: Llm | null;
  today?: string;
  promptVersion?: string;
  /** Server log; gets redacted text only. */
  log?: (line: string) => void;
}

export type CheckInResult =
  | { status: 400 | 404; error: string }
  | {
      status: 200;
      outcome: Outcome;
      route: Route | null;
      aiCheckId: number;
      /** "What I understood", null for the dip explainer or when the AI could not be read. */
      understood: { summary: string; language: Language; confidence: number; confidenceLabel: 'High' | 'Medium' | 'Low' } | null;
      /** The checked AI answer, or the fixed declined or fallback text. */
      text: string;
      goalLine: string;
      facts: FactsUnit;
      /** The quality strip; null when no answer was written. */
      checks: QualityChecks | null;
      options: typeof OPTIONS;
      links: typeof OFFICIAL_LINKS;
      latencyMs: number;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Before you stop (PRD F7) and the dip explainer (F6): architecture Phase 5, steps 1-9. */
export async function runCheckIn(deps: CheckInDeps, input: CheckInInput): Promise<CheckInResult> {
  const started = Date.now();
  const log = deps.log ?? ((line: string) => console.warn(line));
  const today = deps.today ?? todayInIndia();
  const reason = input.moment === 'before_stop' ? (input.text ?? '').trim() : '';

  // Step 1: validate.
  if (input.moment === 'before_stop' && (reason.length < 1 || reason.length > 500)) {
    return { status: 400, error: 'Tell us the reason in 1 to 500 characters.' };
  }
  if (!UUID.test(input.investorId) || !Number.isInteger(input.sipId) || input.sipId < 1) {
    return { status: 404, error: 'We could not find that SIP.' };
  }
  // Step 3 runs here so ownership and state are known before anything else happens.
  const lookup = await retrieveFacts(deps.db, input.investorId, input.sipId, today);
  if (lookup.status === 'not_found') return { status: 404, error: 'We could not find that SIP.' };
  if (lookup.status === 'stopped') return { status: 400, error: 'This SIP is already stopped.' };

  // Step 2: the PII guard. Nothing personal reaches Mistral or the database.
  if (reason) {
    const pii = findPii(reason);
    if (pii.found.length > 0) {
      log(`PII guard rejected a reason (${pii.found.join(', ')}): ${pii.redacted}`);
      return { status: 400, error: PII_MESSAGE };
    }
  }

  const { unit } = lookup;
  let understood: Understanding | null = null;
  let route: Route | null = null;
  let explainers: ExplainerChunk[] = [];
  let answer: string | null = null;
  let checks: QualityChecks | null = null;
  let outcome: Outcome = 'fallback';
  const modelsUsed: string[] = [];
  try {
    if (input.moment === 'is_this_normal') {
      route = 'doubt'; // The dip explainer skips understanding: there is no reason to read.
    } else {
      const read = await readReason({ reader: deps.reader, backup: deps.llm }, unit, reason, log); // Step 4
      understood = read.understanding;
      modelsUsed.push(read.model);
      const decision = decideRoute(understood); // Step 5
      if (decision.outcome === 'declined') outcome = 'declined';
      else if (decision.outcome === 'answer') route = decision.route;
    }
    if (route) {
      explainers = ROUTE_EXPLAINERS[route].map((key) => explainerChunks()[key]); // Step 6
      const language = understood?.language ?? 'en';
      if (deps.llm) modelsUsed.push(deps.llm.model);
      answer = await writeAnswer(deps.llm, { route, facts: unit, explainers, language, moment: input.moment, reason }); // Step 7
      checks = runChecks(answer, [...unit.numbers, ...explainers.flatMap((e) => numberTokens(e.text))], advicePatterns()); // Step 8
      outcome = allPassed(checks) ? 'answer' : 'fallback';
    }
  } catch (err) {
    if (!(err instanceof LlmError)) throw err;
    log(`AI step failed, showing the fallback card: ${err.message}`);
    outcome = 'fallback';
  }

  // Step 9: show and log.
  const latencyMs = Date.now() - started;
  const [logged] = (
    await deps.db.query<{ id: number }>(
      `INSERT INTO ai_checks (investor_id, sip_id, moment, user_text, model, prompt_version, understood, route, explanation, checks, outcome, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        // Reader, then writer: "openai/gpt-oss-120b + ministral-8b-latest". Shows when the backup read the reason.
        input.investorId, input.sipId, input.moment, reason || null, [...new Set(modelsUsed)].join(' + ') || (deps.llm?.model ?? 'none'),
        deps.promptVersion ?? DEFAULT_PROMPT_VERSION, understood, route, answer,
        checks ? { ...checks, explainers: explainers.map((e) => ({ id: e.id, sha256: e.sha256 })) } : null,
        outcome, latencyMs,
      ],
    )
  ).rows;

  return {
    status: 200,
    outcome,
    route,
    aiCheckId: logged.id,
    understood: understood && {
      summary: understood.summary,
      language: understood.language,
      confidence: understood.confidence,
      confidenceLabel: understood.confidence >= 0.8 ? 'High' : understood.confidence >= 0.6 ? 'Medium' : 'Low',
    },
    text: outcome === 'answer' ? answer! : outcome === 'declined' ? DECLINED_TEXT : FALLBACK_TEXT,
    goalLine: lookup.goalLine,
    facts: unit,
    checks,
    options: OPTIONS,
    links: OFFICIAL_LINKS,
    latencyMs,
  };
}

/** POST /api/ai/choice: what the investor did after the card (PRD F7, "choice recorded in ai_checks"). */
export async function recordChoice(db: Db, investorId: string, aiCheckId: number, choice: string): Promise<{ status: 200 | 400 | 404; error?: string }> {
  if (!OPTIONS.some((o) => o.key === choice)) return { status: 400, error: `Choice must be one of ${OPTIONS.map((o) => o.key).join(', ')}.` };
  if (!UUID.test(investorId) || !Number.isInteger(aiCheckId)) return { status: 404, error: 'We could not find that check-in.' };
  const updated = await db.query('UPDATE ai_checks SET user_choice = $3 WHERE id = $1 AND investor_id = $2 RETURNING id', [aiCheckId, investorId, choice]);
  return updated.rows.length ? { status: 200 } : { status: 404, error: 'We could not find that check-in.' };
}

let chunkCache: ReturnType<typeof loadExplainerChunks> | undefined;
let patternCache: AdvicePattern[] | undefined;
const explainerChunks = () => (chunkCache ??= loadExplainerChunks());
const advicePatterns = () => (patternCache ??= loadAdvicePatterns());
