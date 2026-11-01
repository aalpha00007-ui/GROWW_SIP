// eval/results.json and eval/results.md: what the last `npm run eval` found, as files to read, attach or commit.
// Both come from the stored run, as /quality shows it, so the files and the page always agree.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunSummary } from '../server/quality';
import { percent, type EvalReport } from './run';

export function writeResults(report: EvalReport, summary: RunSummary, dir = path.join(process.cwd(), 'eval')): string[] {
  mkdirSync(dir, { recursive: true });
  const files = [path.join(dir, 'results.json'), path.join(dir, 'results.md')];
  writeFileSync(files[0], `${JSON.stringify(resultsJson(report, summary), null, 2)}\n`);
  writeFileSync(files[1], resultsMarkdown(report, summary));
  return files;
}

export function resultsJson(report: EvalReport, summary: RunSummary) {
  const { golden, safety } = report;
  return {
    run: {
      id: summary.runId, date: summary.date, commit: summary.commit, model: summary.model, prompt_version: summary.promptVersion,
      // What CI checks before reusing this run instead of calling the models again (src/eval/reuse.ts).
      ai_files: report.aiFiles ?? null,
    },
    passed: report.passed,
    reasons: report.reasons,
    scores: {
      golden_theme_agreement: golden.themeAgreement,
      golden_behaviour_agreement: golden.behaviourAgreement,
      fallback_correct: safety.fallbackCorrect.total ? safety.fallbackCorrect.correct / safety.fallbackCorrect.total : null,
      must_pass: safety.mustPass,
      routing: safety.routing,
      invariant_failures: report.invariantFailures,
    },
    check_failures: summary.checkFailures,
    disagreements: summary.disagreements,
    // Golden posts are real public posts: results by id, without their text.
    golden: golden.results.map(({ text: _text, ...rest }) => rest),
    safety: safety.results,
  };
}

export function resultsMarkdown(report: EvalReport, summary: RunSummary): string {
  const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\|');
  const lines = [
    '# Eval results',
    '',
    `Run #${summary.runId} · ${summary.date} · commit ${summary.commit.slice(0, 7)} · ${summary.model} · prompt ${summary.promptVersion}`,
    '',
    `**Gate: ${summary.passed ? 'PASSED' : 'FAILED'}**`,
    ...report.reasons.map((r) => `- ${r}`),
    '',
    '| Measure | Result | Rule |',
    '| --- | --- | --- |',
    ...summary.rows.map((r) => `| ${cell(r.label)} | ${cell(r.value)} | ${cell(r.rule)} |`),
    '',
    '## Check failures',
    '',
    ...(summary.checkFailures.length
      ? summary.checkFailures.map((f) => `- ${f.id}: failed ${f.failed.join(', ')}, so it showed facts only`)
      : ['None: every AI answer passed every check.']),
    '',
    `## Where the AI disagreed with the labels (${summary.disagreements.length})`,
    '',
    ...(summary.disagreements.length
      ? [
          '| Case | Label | AI output | Why it failed |',
          '| --- | --- | --- | --- |',
          ...summary.disagreements.map((d) => `| ${d.id}${d.input ? ` "${cell(d.input)}"` : ''} | ${cell(d.label)} | ${cell(d.ai)} | ${cell(d.why)} |`),
        ]
      : ['None: every case matched its label.']),
    '',
    `Golden set: ${report.golden.results.length} hand-labelled posts (call 1 against the labels; listed by id only, as they are real public posts). ` +
      `Safety and routing: ${report.safety.results.length} cases through the full check-in. Theme agreement ${percent(report.golden.themeAgreement)}.`,
    '',
  ];
  return lines.join('\n');
}
