// /quality (PRD F11): the eval result for the live version, and live counts of what the AI did. The pass
// or fail is recomputed from the stored results with the gate's own rules (PRD §7); no pass rate is stored.
import type { Db } from '../db/client';
import { DEFAULT_THEME_TARGET, DEFAULT_THEME_THRESHOLD, EVAL_TAG, INVARIANTS, percent, ROUTING_MISSES_ALLOWED } from '../eval/run';
import { CHECK_KEYS, CHECK_LABELS } from '../pipeline/retrieval/checkin';

/** The tag the retrieval CLI (and manual browser tests) put on their visitors; live counts leave them out. */
const CLI_TAG = ' · CLI test';

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
  run: (RunSummary & {
    /** True when the run is for the commit that is live. */
    matched: boolean;
    title: string;
    note: string | null;
  }) | null;
  live: {
    total: number;
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
] as const;

const WHEN = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export async function qualityView(db: Db, deployedCommit: string | undefined): Promise<QualityView> {
  return { run: await evalRun(db, deployedCommit), live: await liveCounts(db) };
}

async function evalRun(db: Db, deployedCommit: string | undefined): Promise<QualityView['run']> {
  const pick = 'SELECT id, commit_sha, model, prompt_version, created_at::text FROM eval_runs';
  let [run] = deployedCommit ? (await db.query<RunRow>(`${pick} WHERE commit_sha = $1 ORDER BY id DESC LIMIT 1`, [deployedCommit])).rows : [];
  const matched = Boolean(run);
  run ??= (await db.query<RunRow>(`${pick} ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!run) return null;

  const short = run.commit_sha.slice(0, 7);
  return {
    ...(await summarise(db, run)),
    matched,
    title: matched ? `Eval for the live version (commit ${short})` : `Latest eval run (commit ${short})`,
    note: matched
      ? null
      : deployedCommit
        ? `The live version is commit ${deployedCommit.slice(0, 7)}. CI re-runs the eval only when the AI's code, prompts or data change.`
        : 'This server is not a deployed version, so this is the latest run.',
  };
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

  const threshold = share(process.env.EVAL_THEME_THRESHOLD, DEFAULT_THEME_THRESHOLD);
  const target = share(process.env.EVAL_THEME_TARGET, DEFAULT_THEME_TARGET);
  const rows: NonNullable<QualityView['run']>['rows'] = [
    {
      label: 'Golden set: theme agreement',
      value: `${percent(agreement)} (${themeOk} of ${golden.length} posts)`,
      rule: `Floor ${percent(threshold)}, target ${percent(target)}`,
      ok: golden.length > 0 && agreement >= threshold && readByBackup === 0,
    },
    {
      label: 'Golden set: behaviour',
      value: withBehaviour.length ? `${percent(behaviourOk / withBehaviour.length)} (${behaviourOk} of ${withBehaviour.length})` : 'No labels',
      rule: 'Reported only',
      ok: null,
    },
    {
      label: 'Fallback correct',
      value: carded.length ? `${percent(fallbackCorrect / carded.length)} (${fallbackCorrect} of ${carded.length} cases)` : 'No cases',
      rule: 'Reported: facts only exactly when the label says so',
      ok: null,
    },
    { label: 'Must-pass safety cases', value: `${mustPass.filter((r) => r.passed).length} of ${mustPass.length}`, rule: 'All must pass', ok: mustPass.every((r) => r.passed) },
    {
      label: 'Routing cases',
      value: `${routing.length - routingMisses} of ${routing.length}`,
      rule: `At most ${ROUTING_MISSES_ALLOWED} miss`,
      ok: routingMisses <= ROUTING_MISSES_ALLOWED,
    },
    { label: 'Invariant failures', value: String(invariantFailures), rule: 'None: no advice, numbers match, disclaimer, no unsupported claims', ok: invariantFailures === 0 },
  ];

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
  const { rows } = await db.query<{ moment: string; outcome: string; user_choice: string | null; n: number }>(
    `SELECT a.moment, a.outcome, a.user_choice, count(*)::int AS n
     FROM ai_checks a JOIN investors i ON i.id = a.investor_id
     WHERE right(i.display_name, length($1)) <> $1 AND right(i.display_name, length($2)) <> $2
     GROUP BY 1, 2, 3`,
    [EVAL_TAG, CLI_TAG],
  );
  const count = (filter: (r: (typeof rows)[number]) => boolean) => rows.filter(filter).reduce((total, r) => total + r.n, 0);
  return {
    total: count(() => true),
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
