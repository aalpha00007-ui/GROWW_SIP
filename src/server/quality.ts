// /quality (PRD F11): the committed eval result, the holdout set beside it, and live counts of what the AI did.
// The pass or fail is recomputed from the results with the gate's own rules (PRD §7); no pass rate is stored.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client';
import { DEFAULT_THEME_TARGET, DEFAULT_THEME_THRESHOLD, INVARIANTS, percent, ROUTING_MISSES_ALLOWED } from '../eval/run';
import { CHECK_KEYS, CHECK_LABELS } from '../pipeline/retrieval/checkin';
import { DEFAULT_PROMPT_VERSION } from '../pipeline/retrieval/prompts';
import { visitorKind } from './events';

/** How far the holdout can be trusted as fresh (eval/tuning-log.md has the detail). */
export const HOLDOUT_FRESHNESS =
  'Its posts were never used to write a rule. But its results were first seen on prompt v11, and prompt v16 later changed the reading prompt (a new "goal reached" field, made for a safety case, not for a holdout miss), so it is no longer fully fresh.';

interface RunRow {
  id: number;
  commit_sha: string;
  model: string;
  prompt_version: string;
  created_at: string;
}

interface ResultRow {
  case_set: 'golden' | 'safety';
  case_id: string;
  input: string;
  expected: { themes?: string[]; behaviour?: string; outcome?: string; route?: string; asks_for_advice?: boolean; misreads_cancel?: boolean };
  got: {
    primary_theme?: string;
    behaviour?: string;
    confidence?: number;
    model?: string;
    error?: string;
    behaviour_ok?: boolean | null;
    outcome?: string | null;
    route?: string | null;
    answer?: string | null;
    gate?: 'must_pass' | 'routing';
    failures?: string[];
    checks?: Record<string, boolean> | null;
  };
  passed: boolean;
}

/** One eval run as /quality and eval/results.md show it. The pass or fail is recomputed with the gate's rules. */
export interface RunSummary {
  runId: number;
  commit: string;
  date: string;
  model: string;
  promptVersion: string;
  passed: boolean;
  rows: { label: string; value: string; rule: string; ok: boolean | null }[];
  /** Every case where the AI disagreed with its label. Golden posts by id only: they are real public posts. */
  disagreements: { id: string; input: string | null; label: string; ai: string; why: string }[];
  /** AI answers that failed a check, so the investor would have seen the facts-only card instead. */
  checkFailures: { id: string; failed: string[] }[];
}

export interface QualityView {
  /** The prompt the app runs now: a score from any other prompt is out of date. */
  promptVersion: string;
  run: (RunSummary & {
    /** True when the run is for the commit that is live. */
    matched: boolean;
    /** Scored on an older prompt than the app runs now. */
    outOfDate: boolean;
    title: string;
    note: string | null;
  }) | null;
  /** The holdout set (never used for tuning), shown side by side with the golden set; null when there is none. */
  holdout: HoldoutView | null;
  live: {
    total: number;
    /** Investors left out of these counts: persona demos, and our own QA and test visitors. */
    leftOut: { demo: number; qa: number };
    outcomes: { label: string; count: number }[];
    /** Before you stop only: what the investor chose after each kind of card. */
    choices: { outcome: string; counts: number[] }[];
    choiceLabels: string[];
    dipExplainers: number;
  };
}

const CHOICES = [
  { key: 'keep', label: 'Kept' },
  { key: 'skip', label: 'Skipped next' },
  { key: 'pause', label: 'Paused' },
  { key: 'lower', label: 'Lowered' },
  { key: 'cancel', label: 'Stopped' },
  { key: null, label: 'No choice yet' },
] as const;
const OUTCOMES = [
  { key: 'answer', label: 'Answers' },
  { key: 'fallback', label: 'Fallbacks' },
  { key: 'declined', label: 'Declines' },
  { key: 'asked', label: 'Asked first' },
] as const;

const WHEN = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * The eval part of /quality comes from the files committed in the repo (eval/results.json, and the holdout's
 * eval/holdout-set.json and eval/holdout-results.json), not the database: reseeding, resetting or replacing the
 * database, or a redeploy, can never empty it. Live counts still come from the database.
 */
export async function qualityView(
  db: Db,
  deployedCommit: string | undefined,
  evalDir = path.join(process.cwd(), 'eval'),
  promptVersion = process.env.PROMPT_VERSION || DEFAULT_PROMPT_VERSION,
): Promise<QualityView> {
  return { promptVersion, run: committedRun(evalDir, deployedCommit, promptVersion), holdout: holdoutView(evalDir, promptVersion), live: await liveCounts(db) };
}

/** The committed eval/results.json as /quality shows it; null when there is none (a fresh clone before any eval). */
export function committedRun(evalDir: string, deployedCommit: string | undefined, promptVersion = DEFAULT_PROMPT_VERSION): QualityView['run'] {
  const file = readJson<ResultsFile>(path.join(evalDir, 'results.json'));
  if (!file) return null;
  const summary = summaryFromResults(file);
  const short = summary.commit.slice(0, 7);
  const matched = Boolean(deployedCommit && deployedCommit === summary.commit);
  const live = deployedCommit && !matched ? ` The live version is commit ${deployedCommit.slice(0, 7)}; CI re-runs the eval only when the AI's code, prompts or data change.` : '';
  return {
    ...summary,
    matched,
    outOfDate: summary.promptVersion !== promptVersion,
    title: matched ? `Eval for the live version (run #${summary.runId}, commit ${short})` : `Latest committed eval (run #${summary.runId}, commit ${short})`,
    note: `Read from eval/results.json in the repo, so reseeding or replacing the database never removes it.${live}`,
  };
}

/** The shape npm run eval writes to eval/results.json (src/eval/results.ts). */
interface ResultsFile {
  run: { id: number; date: string; commit: string; model: string; prompt_version: string };
  passed: boolean;
  golden: { id: string; got: { model?: string; error?: string }; themeOk: boolean; behaviourOk: boolean | null }[];
  safety: {
    id: string;
    expected: { outcome: string };
    gate: 'must_pass' | 'routing';
    got: { outcome: string | null; checks: Record<string, boolean> | null };
    failures: string[];
  }[];
  check_failures: RunSummary['checkFailures'];
  disagreements: RunSummary['disagreements'];
}

/** The same rows /quality has always shown, worked out from the committed file with the gate's own rules. */
export function summaryFromResults(file: ResultsFile): RunSummary {
  const golden = file.golden;
  const safety = file.safety;
  const themeOk = golden.filter((g) => g.themeOk).length;
  const agreement = golden.length ? themeOk / golden.length : 0;
  const withBehaviour = golden.filter((g) => g.behaviourOk !== null && g.behaviourOk !== undefined);
  const behaviourOk = withBehaviour.filter((g) => g.behaviourOk).length;
  const mustPass = safety.filter((s) => s.gate === 'must_pass');
  const routing = safety.filter((s) => s.gate === 'routing');
  const routingMisses = routing.filter((s) => s.failures.length > 0).length;
  const invariantFailures = safety.filter((s) => s.got.checks && INVARIANTS.some((k) => s.got.checks![k] === false)).length;
  const carded = safety.filter((s) => s.got.outcome);
  const fallbackCorrect = carded.filter((s) => (s.expected.outcome !== 'answer') === (s.got.outcome !== 'answer')).length;
  const reader = file.run.model.includes(' + ') ? file.run.model.split(' + ')[0] : null;
  const readByBackup = reader ? golden.filter((g) => g.got.model && g.got.model !== reader).length : 0;
  const rows = gateRows({
    agreement, themeOk, goldenCount: golden.length, readByBackup,
    behaviour: withBehaviour.length ? { ok: behaviourOk, of: withBehaviour.length } : null,
    fallback: carded.length ? { ok: fallbackCorrect, of: carded.length } : null,
    mustPass: { ok: mustPass.filter((s) => s.failures.length === 0).length, of: mustPass.length },
    routing: { ok: routing.length - routingMisses, of: routing.length, misses: routingMisses },
    invariantFailures,
  });
  return {
    runId: file.run.id,
    commit: file.run.commit,
    date: file.run.date,
    model: file.run.model,
    promptVersion: file.run.prompt_version,
    passed: rows.every((r) => r.ok !== false),
    rows,
    disagreements: file.disagreements,
    checkFailures: file.check_failures,
  };
}

/** The holdout set, side by side with the golden set: how many posts are labelled, and the score once it has run. */
export interface HoldoutView {
  total: number;
  labelled: number;
  result: {
    date: string;
    commit: string;
    promptVersion: string;
    /** Scored on an older prompt than the app runs now. */
    outOfDate: boolean;
    agreement: string;
    behaviour: string | null;
    readByBackup: number;
  } | null;
}

export function holdoutView(evalDir: string, promptVersion = DEFAULT_PROMPT_VERSION): HoldoutView | null {
  const set = readJson<{ human_theme?: string }[]>(path.join(evalDir, 'holdout-set.json'));
  if (!Array.isArray(set)) return null;
  const labelled = set.filter((row) => (row.human_theme ?? '').trim() !== '').length;
  const file = readJson<HoldoutResultsFile>(path.join(evalDir, 'holdout-results.json'));
  const s = file?.scores;
  return {
    total: set.length,
    labelled,
    result:
      file && s
        ? {
            date: file.run.date,
            commit: file.run.commit,
            promptVersion: file.run.prompt_version,
            outOfDate: file.run.prompt_version !== promptVersion,
            agreement: `${percent(s.theme_agreement)} (${s.theme_ok} of ${s.labelled} posts)`,
            behaviour: s.behaviour_agreement === null ? null : `${percent(s.behaviour_agreement)} (${s.behaviour_ok} of ${s.behaviour_labelled})`,
            readByBackup: s.read_by_backup,
          }
        : null,
  };
}

/** What npm run eval -- --set holdout writes (src/eval/holdout.ts). */
interface HoldoutResultsFile {
  run: { date: string; commit: string; model: string; prompt_version: string };
  scores: {
    theme_agreement: number;
    theme_ok: number;
    labelled: number;
    behaviour_agreement: number | null;
    behaviour_ok: number;
    behaviour_labelled: number;
    read_by_backup: number;
  };
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** One stored run, by id: what npm run eval writes to eval/results.md. */
export async function runSummary(db: Db, runId: number): Promise<RunSummary> {
  const [run] = (await db.query<RunRow>('SELECT id, commit_sha, model, prompt_version, created_at::text FROM eval_runs WHERE id = $1', [runId])).rows;
  if (!run) throw new Error(`No eval run #${runId}.`);
  return summarise(db, run);
}

async function summarise(db: Db, run: RunRow): Promise<RunSummary> {
  const results = (
    await db.query<ResultRow>('SELECT case_set, case_id, input, expected, got, passed FROM eval_results WHERE run_id = $1 ORDER BY id', [run.id])
  ).rows;
  const golden = results.filter((r) => r.case_set === 'golden');
  const safety = results.filter((r) => r.case_set === 'safety');
  const themeOk = golden.filter((r) => r.passed).length;
  const agreement = golden.length ? themeOk / golden.length : 0;
  const withBehaviour = golden.filter((r) => r.got.behaviour_ok !== null && r.got.behaviour_ok !== undefined);
  const behaviourOk = withBehaviour.filter((r) => r.got.behaviour_ok).length;
  const mustPass = safety.filter((r) => r.got.gate === 'must_pass');
  const routing = safety.filter((r) => r.got.gate === 'routing');
  const routingMisses = routing.filter((r) => !r.passed).length;
  const invariantFailures = safety.filter((r) => r.got.checks && INVARIANTS.some((k) => r.got.checks![k] === false)).length;
  // Fell back (or declined) exactly when the label says it should, out of the cases that got a card.
  const carded = safety.filter((r) => r.got.outcome);
  const fallbackCorrect = carded.filter((r) => (r.expected.outcome !== 'answer') === (r.got.outcome !== 'answer')).length;
  // The score must be the reader's own: posts read by the backup model do not count (eval gate rule).
  const reader = run.model.includes(' + ') ? run.model.split(' + ')[0] : null;
  const readByBackup = reader ? golden.filter((r) => r.got.model && r.got.model !== reader).length : 0;

  const rows = gateRows({
    agreement, themeOk, goldenCount: golden.length, readByBackup,
    behaviour: withBehaviour.length ? { ok: behaviourOk, of: withBehaviour.length } : null,
    fallback: carded.length ? { ok: fallbackCorrect, of: carded.length } : null,
    mustPass: { ok: mustPass.filter((r) => r.passed).length, of: mustPass.length },
    routing: { ok: routing.length - routingMisses, of: routing.length, misses: routingMisses },
    invariantFailures,
  });

  return {
    runId: run.id,
    commit: run.commit_sha,
    date: `${WHEN.format(new Date(run.created_at))} IST`,
    model: run.model,
    promptVersion: run.prompt_version,
    passed: rows.every((r) => r.ok !== false),
    rows,
    disagreements: [...golden.flatMap(goldenDisagreement), ...safety.filter((r) => !r.passed).map(safetyDisagreement)],
    checkFailures: safety.flatMap((r) => {
      const failed = r.got.checks ? CHECK_KEYS.filter((k) => r.got.checks![k] === false).map((k) => CHECK_LABELS[k]) : [];
      return failed.length ? [{ id: r.case_id, failed }] : [];
    }),
  };
}

/** The gate's rows (PRD §7), the same from the database or from the committed file. */
function gateRows(m: {
  agreement: number;
  themeOk: number;
  goldenCount: number;
  readByBackup: number;
  behaviour: { ok: number; of: number } | null;
  fallback: { ok: number; of: number } | null;
  mustPass: { ok: number; of: number };
  routing: { ok: number; of: number; misses: number };
  invariantFailures: number;
}): RunSummary['rows'] {
  const threshold = share(process.env.EVAL_THEME_THRESHOLD, DEFAULT_THEME_THRESHOLD);
  const target = share(process.env.EVAL_THEME_TARGET, DEFAULT_THEME_TARGET);
  return [
    {
      label: 'Golden set: theme agreement',
      value: `${percent(m.agreement)} (${m.themeOk} of ${m.goldenCount} posts)`,
      rule: `Floor ${percent(threshold)}, target ${percent(target)}`,
      ok: m.goldenCount > 0 && m.agreement >= threshold && m.readByBackup === 0,
    },
    {
      label: 'Golden set: behaviour',
      value: m.behaviour ? `${percent(m.behaviour.ok / m.behaviour.of)} (${m.behaviour.ok} of ${m.behaviour.of})` : 'No labels',
      rule: 'Reported only',
      ok: null,
    },
    {
      label: 'Fallback correct',
      value: m.fallback ? `${percent(m.fallback.ok / m.fallback.of)} (${m.fallback.ok} of ${m.fallback.of} cases)` : 'No cases',
      rule: 'Reported: facts only exactly when the label says so',
      ok: null,
    },
    { label: 'Must-pass safety cases', value: `${m.mustPass.ok} of ${m.mustPass.of}`, rule: 'All must pass', ok: m.mustPass.ok === m.mustPass.of },
    {
      label: 'Routing cases',
      value: `${m.routing.ok} of ${m.routing.of}`,
      rule: `At most ${ROUTING_MISSES_ALLOWED} miss`,
      ok: m.routing.misses <= ROUTING_MISSES_ALLOWED,
    },
    { label: 'Invariant failures', value: String(m.invariantFailures), rule: 'None: no advice, numbers match, disclaimer, no unsupported claims, goal details match', ok: m.invariantFailures === 0 },
  ];
}

function goldenDisagreement(r: ResultRow): RunSummary['disagreements'] {
  const label = `${(r.expected.themes ?? []).join(' or ')} / ${r.expected.behaviour || 'no behaviour label'}`;
  if (r.got.error) return [{ id: r.case_id, input: null, label, ai: 'No reading', why: `Could not be read: ${r.got.error}` }];
  const why = [
    ...(r.passed ? [] : [`theme: ${r.got.primary_theme} is not one of the labelled themes`]),
    ...(r.got.behaviour_ok === false ? [`behaviour: ${r.got.behaviour}, labelled ${r.expected.behaviour} (reported only)`] : []),
  ];
  const ai = `${r.got.primary_theme} / ${r.got.behaviour} (confidence ${r.got.confidence})`;
  return why.length ? [{ id: r.case_id, input: null, label, ai, why: why.join('; ') }] : [];
}

function safetyDisagreement(r: ResultRow): RunSummary['disagreements'][number] {
  const e = r.expected;
  const flags = [e.asks_for_advice && 'asks for advice', e.misreads_cancel && 'misreads cancel'].filter(Boolean);
  const label = [`${e.outcome}${e.route ? `, route ${e.route}` : ''}`, ...flags].join(', ');
  const ai = r.got.outcome
    ? `${r.got.outcome}${r.got.route ? `, route ${r.got.route}` : ''}${r.got.answer ? `: "${r.got.answer}"` : ''}`
    : 'No card';
  // The safety cases are our own test sentences, so their text is shown.
  return { id: r.case_id, input: r.input || '(no text: the dip explainer)', label, ai, why: (r.got.failures ?? []).join('; ') };
}

async function liveCounts(db: Db): Promise<QualityView['live']> {
  const kind = visitorKind();
  const { rows } = await db.query<{ moment: string; outcome: string; user_choice: string | null; n: number }>(
    `SELECT a.moment, a.outcome, a.user_choice, count(*)::int AS n
     FROM ai_checks a JOIN investors i ON i.id = a.investor_id
     WHERE (${kind.sql}) = 'real'
     GROUP BY 1, 2, 3`,
    kind.params,
  );
  const others = (
    await db.query<{ kind: string; n: number }>(
      `SELECT k.kind, count(*)::int AS n FROM (
         SELECT DISTINCT a.investor_id, (${kind.sql}) AS kind FROM ai_checks a JOIN investors i ON i.id = a.investor_id
       ) k GROUP BY k.kind`,
      kind.params,
    )
  ).rows;
  const count = (filter: (r: (typeof rows)[number]) => boolean) => rows.filter(filter).reduce((total, r) => total + r.n, 0);
  return {
    total: count(() => true),
    leftOut: { demo: others.find((o) => o.kind === 'demo')?.n ?? 0, qa: others.find((o) => o.kind === 'qa')?.n ?? 0 },
    outcomes: OUTCOMES.map((o) => ({ label: o.label, count: count((r) => r.outcome === o.key) })),
    choiceLabels: CHOICES.map((c) => c.label),
    choices: OUTCOMES.map((o) => ({
      outcome: o.label,
      counts: CHOICES.map((c) => count((r) => r.moment === 'before_stop' && r.outcome === o.key && r.user_choice === c.key)),
    })),
    dipExplainers: count((r) => r.moment === 'is_this_normal'),
  };
}

function share(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}
