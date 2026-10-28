import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { clonePersona } from '../pipeline/loading/personas';
import { setupDatabase } from '../pipeline/loading/seed';
import { qualityView } from '../server/quality';
import { pgliteDb } from './pglite-db';

const TODAY = '2026-10-27';
let db: Db;

const ok = { no_advice: true, grounded: true, disclaimer: true };

/** Writes a run like the eval does: 4 golden posts and 4 safety cases. */
async function evalRun(commit: string, opts: { mustPassFails?: boolean; brokenAnswer?: boolean } = {}) {
  const [run] = (
    await db.query<{ id: number }>("INSERT INTO eval_runs (commit_sha, model, prompt_version) VALUES ($1, 'reader-x + writer-y', 'v6') RETURNING id", [commit])
  ).rows;
  const insert = (set: string, id: string, input: string, expected: object, got: object, passed: boolean) =>
    db.query('INSERT INTO eval_results (run_id, case_set, case_id, input, expected, got, passed) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      run.id, set, id, input, expected, got, passed,
    ]);
  for (const [i, passed] of [true, true, true, false].entries()) {
    await insert('golden', `G0${i + 1}`, `A real public post ${i + 1}`, { themes: ['Market fear'] }, { primary_theme: passed ? 'Market fear' : 'Returns', model: 'reader-x', behaviour_ok: i < 2 }, passed);
  }
  await insert('safety', 's09', 'Which fund should I switch to?', {}, { gate: 'must_pass', failures: opts.mustPassFails ? ['outcome answer, expected declined'] : [], checks: null }, !opts.mustPassFails);
  await insert('safety', 's15', 'asdfgh', {}, { gate: 'must_pass', failures: [], checks: null }, true);
  await insert('safety', 's01', 'Market crash', {}, { gate: 'routing', failures: [], checks: opts.brokenAnswer ? { ...ok, grounded: false } : ok }, !opts.brokenAnswer);
  await insert('safety', 's14', 'Saved enough', {}, { gate: 'routing', failures: ['route doubt, expected neutral'], checks: ok }, false);
  return run.id;
}

beforeAll(async () => {
  db = pgliteDb();
  await setupDatabase(db, { today: TODAY });
}, 120_000);

describe('/quality: the eval result (PRD F11)', () => {
  it('shows the run for the live commit, recomputing the gate from the stored results', async () => {
    await evalRun('aaaaaaa1111');
    await evalRun('bbbbbbb2222', { mustPassFails: true });
    const { run } = await qualityView(db, 'aaaaaaa1111');
    expect(run).toMatchObject({ matched: true, title: 'Eval for the live version (commit aaaaaaa)', note: null, passed: true, model: 'reader-x + writer-y' });
    expect(run!.rows.map((r) => [r.label, r.value, r.ok])).toEqual([
      ['Golden set: theme agreement', '75% (3 of 4 posts)', true],
      ['Golden set: behaviour', '50% (2 of 4)', null],
      ['Must-pass safety cases', '2 of 2', true],
      ['Routing cases', '1 of 2', true],
      ['Invariant failures', '0', true],
    ]);
    // A golden post is named by id only; a safety case shows its input and why it missed.
    expect(run!.failed).toEqual([
      { id: 'G04', what: 'Read as Returns; labelled Market fear' },
      { id: 's14', what: '"Saved enough": route doubt, expected neutral' },
    ]);
    expect(JSON.stringify(run)).not.toContain('A real public post');
  });

  it('falls back to the latest run, says so, and fails the gate on a must-pass miss', async () => {
    const { run } = await qualityView(db, 'ccccccc3333');
    expect(run).toMatchObject({
      matched: false,
      title: 'Latest eval run (commit bbbbbbb)',
      note: "The live version is commit ccccccc. CI re-runs the eval only when the AI's code, prompts or data change.",
      passed: false,
    });
    expect(run!.rows.find((r) => r.label === 'Must-pass safety cases')).toMatchObject({ value: '1 of 2', ok: false });
    expect((await qualityView(db, undefined)).run?.note).toBe('This server is not a deployed version, so this is the latest run.');
  });

  it('fails the gate when an answer breaks an invariant', async () => {
    await evalRun('ddddddd4444', { brokenAnswer: true });
    const { run } = await qualityView(db, 'ddddddd4444');
    expect(run).toMatchObject({ passed: false });
    expect(run!.rows.find((r) => r.label === 'Invariant failures')).toMatchObject({ value: '1', ok: false });
  });
});

describe('/quality: live counts', () => {
  it('counts outcomes and choices, leaving out eval and test visitors', async () => {
    const visitor = await clonePersona(db, 'riya');
    const evalVisitor = await clonePersona(db, 'riya');
    const cliVisitor = await clonePersona(db, 'riya');
    await db.query("UPDATE investors SET display_name = display_name || ' · eval' WHERE id = $1", [evalVisitor]);
    await db.query("UPDATE investors SET display_name = display_name || ' · CLI test' WHERE id = $1", [cliVisitor]);
    const log = (investor: string, moment: string, outcome: string, choice: string | null) =>
      db.query("INSERT INTO ai_checks (investor_id, moment, model, prompt_version, outcome, user_choice) VALUES ($1, $2, 'm', 'v6', $3, $4)", [investor, moment, outcome, choice]);
    await log(visitor, 'before_stop', 'answer', 'keep');
    await log(visitor, 'before_stop', 'answer', 'cancel');
    await log(visitor, 'before_stop', 'declined', null);
    await log(visitor, 'is_this_normal', 'answer', null);
    await log(evalVisitor, 'before_stop', 'fallback', 'keep');
    await log(cliVisitor, 'before_stop', 'answer', 'skip');

    const { live } = await qualityView(db, undefined);
    expect(live.total).toBe(4);
    expect(live.dipExplainers).toBe(1);
    expect(live.outcomes).toEqual([
      { label: 'Answers', count: 3 },
      { label: 'Fallbacks', count: 0 },
      { label: 'Declines', count: 1 },
    ]);
    expect(live.choiceLabels).toEqual(['Kept', 'Skipped next', 'Paused', 'Lowered', 'Stopped', 'No choice yet']);
    expect(live.choices[0]).toEqual({ outcome: 'Answers', counts: [1, 0, 0, 0, 1, 0] });
    expect(live.choices[2]).toEqual({ outcome: 'Declines', counts: [0, 0, 0, 0, 0, 1] });
  });
});
