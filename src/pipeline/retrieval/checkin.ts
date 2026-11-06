import type { Db } from '../../db/client';
import { LlmError, type Llm } from '../../llm/chat';
import { loadExplainerChunks, type ExplainerChunk } from '../chunking/explainers';
import { factsProblem, type FactsUnit } from '../chunking/facts';
import { numberTokens } from '../chunking/format';
import { todayInIndia } from '../loading/dates';
import { loadAdvicePatterns, loadClaimPatterns, type AdvicePattern, type Outcome, type Route } from '../loading/fixtures';
import { readReason, writeAnswer, type Understanding } from './ai';
import { allPassed, answerWords, runChecks, type QualityChecks } from './checks';
import { decideRoute, saysGoalReached, type DeclineKind, type GoalDone } from './decide';
import { expectationQuestion, type Expectation, type ExpectationQuestion } from './expectations';
import { retrieveFacts } from './facts';
import { detectLanguage, writtenIn } from './language';
import { findPii, PII_MESSAGE } from './pii';
import { DEFAULT_PROMPT_VERSION, DISCLAIMER, disclaimerFor, LOCAL_DISCLAIMERS, MAX_WORDS, REWRITE_AIM_WORDS, ROUTE_EXPLAINERS, type DraftProblem, type Language, type Moment } from './prompts';
import { comparisons, EXPECTATION_SLOTS, fillSlots, GOAL_DONE_SLOTS, GOAL_PASSED_SLOTS, situation, slotLanguage, slotsFor, writtenNumbers, type Slot } from './slots';

export const DECLINED_TEXT =
  "I can't recommend funds or tell you to buy, sell or switch. Here are the facts about your SIP and official places to learn more.";
export const PREDICTION_TEXT =
  "This app can't predict whether markets will rise or fall. Here are the facts about your SIP and official places to learn more.";
export const FALLBACK_TEXT = "I couldn't give a reliable answer here.";

/** The fixed card texts in the investor's language. Fixed text, so nothing in them needs checking. */
const CARD_TEXTS: Record<'advice' | 'prediction' | 'fallback', Record<'en' | 'hi' | 'hinglish', string>> = {
  advice: {
    en: DECLINED_TEXT,
    hinglish: 'Hum funds recommend nahi kar sakte, na hi buy, sell ya switch karne ko keh sakte hain. Yeh rahe aapke SIP ke facts aur seekhne ke liye official jagah.',
    hi: 'हम फंड नहीं सुझा सकते, न ही खरीदने, बेचने या बदलने को कह सकते हैं। ये रहे आपके SIP के तथ्य और जानकारी के आधिकारिक स्रोत।',
  },
  prediction: {
    en: PREDICTION_TEXT,
    hinglish: 'Yeh app nahi bata sakta ki market upar jayega ya neeche. Yeh rahe aapke SIP ke facts aur seekhne ke liye official jagah.',
    hi: 'यह ऐप नहीं बता सकता कि बाज़ार ऊपर जाएगा या नीचे। ये रहे आपके SIP के तथ्य और जानकारी के आधिकारिक स्रोत।',
  },
  fallback: {
    en: FALLBACK_TEXT,
    hinglish: 'Hum yahan bharosemand jawab nahi de paaye.',
    hi: 'हम यहाँ भरोसेमंद जवाब नहीं दे पाए।',
  },
};

/** A facts-only card's text: the fixed text, then the disclaimer as an AI answer has it, once, in the reply's language. */
export function cardText(kind: keyof typeof CARD_TEXTS, language: Language): string {
  const lang = language === 'hi' || language === 'hinglish' ? language : 'en';
  return `${CARD_TEXTS[kind][lang]} ${disclaimerFor(language)}`;
}

/**
 * The disclaimer once, in the reply's language: the site's banner has it in English on every page. A Hindi or Hinglish
 * reply that ended in English, or in both, keeps its own language's. A reply with no disclaimer stays as it is, so the
 * check fails it.
 */
export function oneDisclaimer(answer: string, language: Language): string {
  const local = disclaimerFor(language);
  if (local === DISCLAIMER) return answer;
  if (!answer.includes(DISCLAIMER) && !answer.includes(local)) return answer;
  const body = [DISCLAIMER, local].reduce((text, d) => text.split(d).join(' '), answer).replace(/[ \t]+/g, ' ').trim();
  return `${body} ${local}`;
}

/**
 * What a first draft needs fixed before it can be shown, if anything (step 7b). Length is counted on the answer as
 * the investor would see it, filled in, exactly as the length check counts it.
 */
export function draftProblems(draft: string, slots: Slot[], language: Language): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const words = answerWords(oneDisclaimer(fillSlots(draft, slots, language), language));
  if (words > MAX_WORDS) {
    const lang = slotLanguage(language);
    const used = new Set([...draft.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1].trim()));
    const longest = slots
      .filter((s) => used.has(s.name))
      .map((s) => ({ name: `{${s.name}}`, words: s.values[lang].trim().split(/\s+/).length }))
      .filter((s) => s.words >= 6)
      .sort((a, b) => b.words - a.words)
      .slice(0, 3)
      .map((s) => s.name);
    problems.push({ kind: 'length', over: words / REWRITE_AIM_WORDS, longest });
  }
  const written = writtenNumbers(draft, slots.map((s) => s.name));
  // Unknown placeholders are named back to the writer, unless the name has a digit: it never sees a number.
  if (written.length > 0) problems.push({ kind: 'numbers', unknown: written.filter((w) => w.startsWith('{') && !/\p{Nd}/u.test(w)) });
  const compared = comparisons(draft);
  if (compared.length > 0) problems.push({ kind: 'comparison', found: compared });
  return problems;
}

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
  /** Unmet expectations: ask what they expected before answering. The app asks; the eval reads the reason straight. */
  askFirst?: boolean;
  /** What they said they expected, from the chips. */
  expectation?: Expectation;
  /** The check-in that asked, so the same reason isn't read twice. */
  askedId?: number;
}

/** Why the fallback card was shown, in plain words on the card. */
export type FallbackReason =
  | { kind: 'checks'; failed: CheckKey[] }
  | { kind: 'unsure' }
  | { kind: 'timeout' }
  | { kind: 'error' }
  | { kind: 'facts' };

export const CHECK_KEYS = ['no_advice', 'grounded', 'disclaimer', 'length', 'no_claims', 'in_language', 'goal_facts'] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

/** The quality strip's names for the checks. */
export const CHECK_LABELS: Record<CheckKey, string> = {
  no_advice: 'No investment advice',
  grounded: 'Numbers match your SIP',
  disclaimer: 'Disclaimer shown',
  length: 'Short enough',
  no_claims: 'No unsupported claims',
  in_language: 'In your language',
  goal_facts: 'Goal details match your SIP',
};

export interface CheckInDeps {
  db: Db;
  /** Mistral: writes the answer, and reads the reason when there is no reader. Null when no MISTRAL_API_KEY is set. */
  llm: Llm | null;
  /** Groq: reads the reason (call 1), with Mistral as its backup, and writes Hindi and Hinglish answers. Absent when no GROQ_API_KEY is set. */
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
      moment: Moment;
      /** 'asked': no answer yet: `question` asks what they expected. */
      outcome: Outcome | 'asked';
      route: Route | null;
      aiCheckId: number;
      /** "What I understood", null for the dip explainer or when the AI could not be read. */
      understood: { summary: string; language: Language } | null;
      /** The chips to show when the outcome is 'asked'. */
      question: ExpectationQuestion | null;
      /** The checked AI answer, or the fixed declined or fallback text. */
      text: string;
      goalLine: string;
      facts: FactsUnit;
      /** The quality strip; null when no answer was written. */
      checks: QualityChecks | null;
      /** Why the fallback card was shown; null for an answer or a decline. */
      fallbackReason: FallbackReason | null;
      /** Why the reason was declined: advice, or a market prediction; null unless declined. */
      declineKind: DeclineKind | null;
      /** The card's language: the investor's, read by the AI or, when it could not, by code. */
      language: Language;
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
  // Wrong facts never reach the AI: the investor gets the safe fallback with the facts table.
  const problem = factsProblem(lookup.facts);
  if (problem) console.error(`Facts for SIP ${input.sipId} don't add up (${problem}); showing the fallback card.`);
  let understood: Understanding | null = null;
  let route: Route | null = null;
  let explainers: ExplainerChunk[] = [];
  let answer: string | null = null;
  /** The writer's own text, placeholders and all, before the server filled them in. Logged with the checks. */
  let modelText: string | null = null;
  /** The first draft, when the writer was asked for a second one, and why. Logged with the checks. */
  let firstDraft: string | null = null;
  let secondDraftFor: DraftProblem['kind'][] | null = null;
  let checks: QualityChecks | null = null;
  let outcome: Outcome = 'fallback';
  let declineKind: DeclineKind | null = null;
  let goalDone: GoalDone | null = null;
  /** What they expected, once they have said: unmet expectations get their own answer. */
  let expectation: Expectation | null = null;
  let asked = false;
  let fallbackReason: FallbackReason | null = problem ? { kind: 'facts' } : null;
  // The investor's language by code until the AI reads it: the fallback card uses it when the AI can't.
  let language: Language = detectLanguage(reason);
  const modelsUsed: string[] = [];
  try {
    if (problem) {
      // Straight to the fallback below: no model call.
    } else if (input.moment === 'is_this_normal') {
      route = 'doubt'; // The dip explainer skips understanding: there is no reason to read.
    } else {
      // The chips' answer comes with the check-in that asked: the same reason is not read twice.
      const earlier = input.expectation && input.askedId ? await askedReading(deps.db, input.askedId, input.investorId, input.sipId) : null;
      if (earlier) understood = earlier;
      else {
        const read = await readReason({ reader: deps.reader, backup: deps.llm }, unit, reason, log); // Step 4
        understood = read.understanding;
        modelsUsed.push(read.model);
      }
      language = understood.language;
      const decision = decideRoute(understood, { datePassed: lookup.schedule.goalDatePassed, saidInWords: saysGoalReached(reason) }); // Step 5
      if (decision.outcome === 'declined') {
        outcome = 'declined';
        declineKind = decision.kind;
      } else if (decision.outcome === 'answer') {
        route = decision.route;
        goalDone = decision.goalDone ?? null;
        if (input.expectation && !goalDone && route !== 'explain' && route !== 'autopay') {
          route = 'doubt';
          expectation = input.expectation;
        } else if (input.askFirst && !input.expectation && !goalDone && route === 'doubt' && understood.primary_theme === 'Expectation mismatch') {
          asked = true;
        }
      } else fallbackReason = { kind: 'unsure' };
    }
    if (route && !asked) {
      // Step 6. A reached goal also gets what stopping does: it is one of the choices that fits.
      explainers = (goalDone ? (['stop'] as const) : ROUTE_EXPLAINERS[route]).map((key) => explainerChunks()[key]);
      // The writer gets placeholders, never numbers: the server fills them in with each number's meaning.
      const only = goalDone === 'said' ? GOAL_DONE_SLOTS : goalDone === 'date_passed' ? GOAL_PASSED_SLOTS : expectation ? EXPECTATION_SLOTS : undefined;
      const slots = slotsFor(lookup.facts, { pause: explainers.some((e) => e.key === 'pause' || e.key === 'stop'), only });
      const args = {
        route, slots: slots.map(({ name, reads }) => ({ name, reads })), situation: situation(lookup.facts, goalDone),
        explainers, language, moment: input.moment, reason, goalDone, expectation,
      };
      // Step 7. Hindi and Hinglish answers are written by the bigger model on Groq, with Mistral as its backup.
      const groqWrites = (language === 'hi' || language === 'hinglish') && deps.reader;
      let writer: Llm | null = null;
      if (groqWrites) {
        try {
          modelText = await writeAnswer(deps.reader!, args);
          writer = deps.reader!;
          modelsUsed.push(deps.reader!.model);
        } catch (err) {
          if (!(err instanceof LlmError) || !deps.llm) throw err;
          log(`Writer ${deps.reader!.model} failed (${err.message}); ${deps.llm.model} writes instead`);
        }
      }
      if (modelText === null) {
        try {
          modelText = await writeAnswer(deps.llm, args);
          writer = deps.llm;
          if (deps.llm) modelsUsed.push(deps.llm.model);
        } catch (err) {
          // v15: the other way round for English. Mistral now and then takes over 10 s (the live dip explainer
          // showed "AI unavailable" on 3 Nov), so Groq writes instead, unless it has just failed to.
          if (!(err instanceof LlmError) || groqWrites || !deps.reader) throw err;
          log(`Writer ${deps.llm?.model ?? 'none'} failed (${err.message}); ${deps.reader.model} writes instead`);
          modelText = await writeAnswer(deps.reader, args);
          writer = deps.reader;
          modelsUsed.push(deps.reader.model);
        }
      }
      // Step 7b (v12): one second try when the draft is too long once filled in, states a number itself, or
      // compares two numbers. The same writer gets the draft back with what to fix. Whatever comes back gets every
      // check in step 8, so a second draft that still fails shows the facts-only card. Advice or a claim gets no
      // second try: those go straight to the facts-only card.
      const filledDraft = oneDisclaimer(fillSlots(modelText, slots, language), language);
      const unsafe = [...advicePatterns(), ...claimPatterns()].some((p) => p.regex.test(filledDraft));
      const problems = unsafe ? [] : draftProblems(modelText, slots, language);
      if (problems.length > 0) {
        firstDraft = modelText;
        secondDraftFor = problems.map((p) => p.kind);
        try {
          modelText = await writeAnswer(writer, args, { draft: modelText, problems });
        } catch (err) {
          if (!(err instanceof LlmError)) throw err;
          log(`Second draft failed (${err.message}); the first draft is checked as it is`);
        }
      }
      // Any number the model wrote itself, or a placeholder this SIP doesn't have, fails "Numbers match your SIP".
      // So does a comparison between two numbers it can't see ("larger than").
      const written = writtenNumbers(modelText, slots.map((s) => s.name));
      const compared = comparisons(modelText);
      answer = oneDisclaimer(fillSlots(modelText, slots, language), language);
      // Step 8, on the answer as the investor would see it. The filled numbers are still checked against the facts.
      const explained = explainers.flatMap((e) => numberTokens(e.text));
      checks = runChecks(answer, [...unit.numbers, ...explained], advicePatterns(), claimPatterns(), language, {
        // The explainers count instalments ("the next 1 to 3 instalments").
        instalments: [...unit.kinds.instalments, ...explained],
        units: unit.kinds.units,
        dates: unit.kinds.dates,
      }, lookup.facts);
      if (written.length > 0 || compared.length > 0) {
        const own = [...written.map((w) => `written by the AI: ${w}`), ...compared.map((c) => `compared by the AI: ${c}`)];
        checks = { ...checks, grounded: false, ungrounded: [...own, ...checks.ungrounded] };
      }
      if (secondDraftFor) checks = { ...checks, second_draft: secondDraftFor };
      // The language is judged on the model's own words: the filled-in phrases are in the right language by
      // construction, and Hindi ones would otherwise make a Hinglish reply look like Hindi.
      checks = { ...checks, in_language: writtenIn(modelText.replace(/\{[^{}]*\}/g, ' '), language) };
      outcome = allPassed(checks) ? 'answer' : 'fallback';
      if (outcome === 'fallback') {
        fallbackReason = { kind: 'checks', failed: CHECK_KEYS.filter((k) => !checks![k]) };
      }
    }
  } catch (err) {
    if (!(err instanceof LlmError)) throw err;
    log(`AI step failed, showing the fallback card: ${err.message}`);
    outcome = 'fallback';
    fallbackReason = { kind: /did not answer within/.test(err.message) ? 'timeout' : 'error' };
  }

  // Step 9: show and log.
  const latencyMs = Date.now() - started;
  const shown = asked ? 'asked' : outcome;
  const [logged] = (
    await deps.db.query<{ id: number }>(
      `INSERT INTO ai_checks (investor_id, sip_id, moment, user_text, model, prompt_version, understood, route, explanation, checks, outcome, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        // Reader, then writer: "openai/gpt-oss-120b + ministral-8b-latest". Shows when the backup read the reason.
        input.investorId, input.sipId, input.moment, reason || null, [...new Set(modelsUsed)].join(' + ') || (deps.llm?.model ?? 'none'),
        deps.promptVersion ?? DEFAULT_PROMPT_VERSION, understood, route, answer,
        checks ? { ...checks, model_text: modelText, first_draft: firstDraft, goal_done: goalDone, expectation, explainers: explainers.map((e) => ({ id: e.id, sha256: e.sha256 })) } : null,
        shown, latencyMs,
      ],
    )
  ).rows;

  return {
    status: 200,
    moment: input.moment,
    outcome: shown,
    route,
    aiCheckId: logged.id,
    understood: understood && { summary: understood.summary, language: understood.language },
    question: asked ? expectationQuestion(language) : null,
    text: asked ? '' : outcome === 'answer' ? answer! : cardText(outcome === 'declined' ? declineKind! : 'fallback', language),
    goalLine: lookup.goalLine,
    facts: unit,
    checks,
    fallbackReason: !asked && outcome === 'fallback' ? (fallbackReason ?? { kind: 'error' }) : null,
    declineKind: outcome === 'declined' ? declineKind : null,
    language,
    options: OPTIONS,
    links: OFFICIAL_LINKS,
    latencyMs,
  };
}

/** The reading a check-in that asked has already made, if it is this investor's, on this SIP. */
async function askedReading(db: Db, askedId: number, investorId: string, sipId: number): Promise<Understanding | null> {
  if (!Number.isInteger(askedId)) return null;
  const [row] = (
    await db.query<{ understood: Understanding | null }>(
      "SELECT understood FROM ai_checks WHERE id = $1 AND investor_id = $2 AND sip_id = $3 AND outcome = 'asked'",
      [askedId, investorId, sipId],
    )
  ).rows;
  return row?.understood ?? null;
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
let claimCache: AdvicePattern[] | undefined;
const claimPatterns = () => (claimCache ??= loadClaimPatterns());
