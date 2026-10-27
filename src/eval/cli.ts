// npm run eval: runs the eval against Neon, Groq and Mistral, prints the report, and exits 1 when the gate
// fails, so GitHub Actions stops the deploy (build spec §11).
import { execFileSync } from 'node:child_process';
import { connectNeon } from '../db/client';
import { loadEnvFiles } from '../env';
import { groqFromEnv, mistralFromEnv } from '../llm/chat';
import { loadEvalCases, loadGoldenSet } from '../pipeline/loading/fixtures';
import { DEFAULT_PROMPT_VERSION, MAX_WORDS } from '../pipeline/retrieval/prompts';
import { DEFAULT_THEME_TARGET, DEFAULT_THEME_THRESHOLD, percent, ROUTING_MISSES_ALLOWED, runEval, type EvalReport } from './run';

async function main(): Promise<void> {
  loadEnvFiles();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is empty. Set it in .env or .env.local.');
  // Patient: the eval waits out free-plan rate limits instead of scoring the backup or the fallback card.
  const llm = mistralFromEnv(process.env, { patient: true });
  if (!llm) throw new Error('MISTRAL_API_KEY is empty. The eval needs the model; set it in .env or .env.local.');
  const reader = groqFromEnv(process.env, { patient: true });
  const themeThreshold = share('EVAL_THEME_THRESHOLD', DEFAULT_THEME_THRESHOLD);
  const themeTarget = share('EVAL_THEME_TARGET', DEFAULT_THEME_TARGET);

  const golden = loadGoldenSet();
  const cases = loadEvalCases();
  const db = connectNeon(process.env.DATABASE_URL);
  try {
    const promptVersion = process.env.PROMPT_VERSION || DEFAULT_PROMPT_VERSION;
    const models = reader ? `${reader.model} reads, ${llm.model} writes` : `${llm.model} reads and writes`;
    console.log(`Running the eval: ${golden.labelled} golden posts and ${cases.length} safety cases, one call at a time (${models}, prompt ${promptVersion}).`);
    const report = await runEval(
      { db, llm, reader, commitSha: commitSha(), promptVersion, themeThreshold, themeTarget, log: (line) => console.log(`  ${line}`) },
      { golden: golden.rows, cases },
    );
    print(report);
    if (!report.passed) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

/** A share from 0 to 1 set in the environment, such as EVAL_THEME_THRESHOLD=0.65. */
function share(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!(value > 0 && value <= 1)) throw new Error(`${name} must be a number above 0 and at most 1, such as ${fallback}.`);
  return value;
}

/** GitHub Actions sets GITHUB_SHA; locally it is the checked-out commit, or "local" outside Git. */
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'local';
  }
}

function print(r: EvalReport): void {
  const g = r.golden;
  const themeHits = g.results.filter((x) => x.themeOk).length;
  const behaviourCounted = g.results.filter((x) => x.behaviourOk !== null);
  const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 3)}...` : text).replace(/\s+/g, ' ');

  console.log(`\n== Eval run #${r.runId} · commit ${r.commitSha.slice(0, 7)} · ${r.model} · prompt ${r.promptVersion}`);

  console.log(`\nGolden set (call 1 against your labels)`);
  console.log(`  theme:     ${themeHits} of ${g.results.length} (${percent(g.themeAgreement)}), floor ${percent(r.themeThreshold)}, target ${percent(r.themeTarget)}`);
  if (g.behaviourAgreement !== null) {
    console.log(`  behaviour: ${behaviourCounted.filter((x) => x.behaviourOk).length} of ${behaviourCounted.length} (${percent(g.behaviourAgreement)}), reported only`);
  }
  if (g.skipped > 0) console.log(`  skipped:   ${g.skipped} posts with no hand label`);
  if (g.readByBackup > 0) console.log(`  note:      the backup model read ${g.readByBackup} posts because the reader failed`);
  for (const x of g.results.filter((x) => !x.themeOk || x.behaviourOk === false)) {
    const got = 'error' in x.got ? `error: ${x.got.error}` : `${x.got.primary_theme} / ${x.got.behaviour} (confidence ${x.got.confidence})`;
    const what = !x.themeOk ? 'theme miss' : 'behaviour miss';
    console.log(`  ${x.id} ${what}: you ${x.expected.themes.join(', ')} / ${x.expected.behaviour || '-'} · AI ${got}`);
    console.log(`      "${short(x.text)}"`);
  }

  const { mustPass, routing } = r.safety;
  console.log(`\nSafety cases (must all pass): ${mustPass.passed} of ${mustPass.total}`);
  console.log(`Routing cases (at most ${ROUTING_MISSES_ALLOWED} miss): ${routing.passed} of ${routing.total}`);
  for (const s of r.safety.results.filter((s) => s.failures.length > 0)) {
    console.log(`  ${s.id} ${s.gate === 'must_pass' ? 'MUST-PASS' : 'routing'} (${s.persona}, ${s.moment}) "${short(s.text) || 'no text'}"`);
    console.log(`      ${s.failures.join('; ')}`);
    if (s.got.answer) console.log(`      AI wrote: ${s.got.answer}`);
    const c = s.got.checks;
    if (c) {
      const failed = (['no_advice', 'grounded', 'disclaimer', 'length'] as const).filter((k) => !c[k]);
      if (failed.length) console.log(`      checks failed: ${failed.map((k) => (k === 'length' ? `length (${c.words} words, limit ${MAX_WORDS})` : k)).join(', ')}`);
      if (c.advice_found.length) console.log(`      advice found: ${c.advice_found.join(', ')}`);
      if (c.ungrounded.length) console.log(`      numbers not in the facts: ${c.ungrounded.join(', ')}`);
    }
  }

  console.log(`\nInvariants on every AI answer (no advice, grounded, disclaimer): ${r.invariantFailures} failures`);
  console.log(r.passed ? '\nRESULT: PASS' : `\nRESULT: FAIL\n${r.reasons.map((reason) => `  - ${reason}`).join('\n')}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
