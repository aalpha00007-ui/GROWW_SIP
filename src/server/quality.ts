// /quality (PRD F11): the eval result for the live version, and live counts of what the AI did. The pass
// or fail is recomputed from the stored results with the gate's own rules (PRD §7); no pass rate is stored.
import type { Db } from '../db/client';
import { DEFAULT_THEME_TARGET, DEFAULT_THEME_THRESHOLD, EVAL_TAG, INVARIANTS, percent, ROUTING_MISSES_ALLOWED } from '../eval/run';

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
  expected: { themes?: string[] };
  got: {
    primary_theme?: string;
    model?: string;
    error?: string;
    behaviour_ok?: boolean | null;
    gate?: 'must_pass' | 'routing';
    failures?: string[];
    checks?: Record<string, boolean> | null;
  };
  passed: boolean;
}

export interface QualityView {
  run: {
    /** True when the run is for the commit that is live. */
    matched: boolean;
    title: string;
    note: string | null;
    date: string;
    model: string;
    promptVersion: string;
    passed: boolean;
    rows: { label: string; value: string; rule: string; ok: boolean | null }[];
    failed: { id: string; what: string }[];
  } | null;
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
    { label: 'Must-pass safety cases', value: `${mustPass.filter((r) => r.passed).length} of ${mustPass.length}`, rule: 'All must pass', ok: mustPass.every((r) => r.passed) },
    {
      label: 'Routing cases',
      value: `${routing.length - routingMisses} of ${routing.length}`,
      rule: `At most ${ROUTING_MISSES_ALLOWED} miss`,
      ok: routingMisses <= ROUTING_MISSES_ALLOWED,
    },
    { label: 'Invariant failures', value: String(invariantFailures), rule: 'None: no advice, numbers match, disclaimer', ok: invariantFailures === 0 },
  ];

  const short = run.commit_sha.slice(0, 7);
  return {
    matched,
    title: matched ? `Eval for the live version (commit ${short})` : `Latest eval run (commit ${short})`,
    note: matched
      ? null
      : deployedCommit
        ? `The live version is commit ${deployedCommit.slice(0, 7)}. CI re-runs the eval only when the AI's code, prompts or data change.`
        : 'This server is not a deployed version, so this is the latest run.',
    date: `${WHEN.format(new Date(run.created_at))} IST`,
    model: run.model,
    promptVersion: run.prompt_version,
    passed: rows.every((r) => r.ok !== false),
    rows,
    failed: [
      // Golden posts come from real public posts: shown by id and result, not by their text.
      ...golden
        .filter((r) => !r.passed)
        .map((r) => ({
          id: r.case_id,
          what: r.got.error ? `Could not be read: ${r.got.error}` : `Read as ${r.got.primary_theme}; labelled ${(r.expected.themes ?? []).join(' or ')}`,
        })),
      ...safety.filter((r) => !r.passed).map((r) => ({ id: r.case_id, what: `"${r.input}": ${(r.got.failures ?? []).join('; ')}` })),
    ],
  };
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
