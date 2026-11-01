// CI reuses the committed eval only when it was made on exactly the AI files being deployed. No AI or database call.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_FILES, aiFilesFingerprint } from '../eval/fingerprint';
import { resultsJson } from '../eval/results';
import { ciModels, reuseDecision } from '../eval/reuse';
import type { EvalReport } from '../eval/run';
import { DEFAULT_GROQ_MODEL, DEFAULT_MISTRAL_MODEL } from '../llm/chat';
import type { RunSummary } from '../server/quality';

/** A small project: two AI files, a test and the committed results. */
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'fingerprint-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return { root, list: Object.keys(files) };
}

const BASE = {
  'src/pipeline/retrieval/prompts.ts': 'export const RULE = "never write a number";\n',
  'data/eval/golden_set/golden_set.csv': 'id,text\nG01,a post\n',
  'src/tests/a.test.ts': 'test\n',
  'eval/results.json': '{}\n',
  'README.md': '# readme\n',
};

describe('The AI files fingerprint', () => {
  it("uses the same pattern as CI's \"Did the AI change?\" step", () => {
    const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
    const ciPattern = /grep -qE '([^']+)'/.exec(workflow)![1];
    expect(AI_FILES.source.replace(/\\\//g, '/')).toBe(ciPattern);
  });

  it('is the same with Windows or Linux line endings, and changes when an AI file changes', () => {
    const a = project(BASE);
    const b = project({ ...BASE, 'src/pipeline/retrieval/prompts.ts': BASE['src/pipeline/retrieval/prompts.ts'].replace(/\n/g, '\r\n') });
    const fa = aiFilesFingerprint(a.root, a.list);
    expect(fa).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), files: 2 });
    expect(aiFilesFingerprint(b.root, b.list)).toEqual(fa);
    const changed = project({ ...BASE, 'src/pipeline/retrieval/prompts.ts': 'export const RULE = "write numbers";\n' });
    expect(aiFilesFingerprint(changed.root, changed.list).hash).not.toBe(fa.hash);
    const golden = project({ ...BASE, 'data/eval/golden_set/golden_set.csv': 'id,text\nG01,another post\n' });
    expect(aiFilesFingerprint(golden.root, golden.list).hash).not.toBe(fa.hash);
  });

  it('ignores files that are not AI files: tests, docs and the committed results', () => {
    const a = project(BASE);
    const b = project({ ...BASE, 'src/tests/a.test.ts': 'other test\n', 'README.md': '# other\n', 'eval/results.json': '{"run":1}\n' });
    expect(aiFilesFingerprint(b.root, b.list)).toEqual(aiFilesFingerprint(a.root, a.list));
  });

  it('notices a new AI file, and leaves out one Git still lists but that was deleted', () => {
    const a = project(BASE);
    const added = project({ ...BASE, 'src/llm/new-model.ts': 'export const MODEL = "x";\n' });
    expect(aiFilesFingerprint(added.root, added.list).hash).not.toBe(aiFilesFingerprint(a.root, a.list).hash);
    expect(aiFilesFingerprint(a.root, [...a.list, 'src/pipeline/gone.ts'])).toEqual(aiFilesFingerprint(a.root, a.list));
  });

  it("covers this project's prompts, checker, models, eval, data and workflow", () => {
    const { hash, files } = aiFilesFingerprint();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(files).toBeGreaterThan(40);
    for (const file of ['src/pipeline/retrieval/prompts.ts', 'src/pipeline/retrieval/checks.ts', 'src/pipeline/retrieval/slots.ts', 'src/llm/chat.ts', 'data/eval/golden_set/golden_set.csv', '.github/workflows/ci.yml']) {
      expect(AI_FILES.test(file), file).toBe(true);
    }
    for (const file of ['src/tests/reuse.test.ts', 'src/app/quality/page.tsx', 'src/server/checkin-card.ts', 'eval/results.json', 'eval/holdout-set.json']) {
      expect(AI_FILES.test(file), file).toBe(false);
    }
  });
});

describe('Whether CI may reuse the committed eval', () => {
  const current = { hash: 'a'.repeat(64), files: 90 };
  const models = `${DEFAULT_GROQ_MODEL} + ${DEFAULT_MISTRAL_MODEL}`;
  /** A passing committed run: 4 golden posts (3 agree), the must-pass cases pass, no broken answer. */
  const results = (over: { hash?: string | null; model?: string; passed?: boolean; themeOk?: boolean[]; backup?: boolean } = {}) => ({
    run: { id: 24, date: '2 Nov 2026', commit: 'abc', model: over.model ?? models, prompt_version: 'v11', ai_files: over.hash === null ? null : { hash: over.hash ?? current.hash, files: 90 } },
    passed: over.passed ?? true,
    golden: (over.themeOk ?? [true, true, true, false]).map((themeOk, i) => ({
      id: `G0${i + 1}`, got: { model: over.backup && i === 0 ? DEFAULT_MISTRAL_MODEL : DEFAULT_GROQ_MODEL }, themeOk, behaviourOk: null,
    })),
    safety: [{ id: 's09', gate: 'must_pass', expected: { outcome: 'declined' }, got: { outcome: 'declined', checks: null }, failures: [] }],
    check_failures: [],
    disagreements: [],
  });

  it("uses the models CI's eval would use", () => {
    expect(ciModels({})).toBe(models);
    expect(ciModels({ GROQ_MODEL: 'g', MISTRAL_MODEL: 'm' })).toBe('g + m');
  });

  it('reuses a passing run made on exactly these AI files with these models', () => {
    expect(reuseDecision(results(), current, models)).toEqual({
      reuse: true,
      reason: `run #24 passed on these exact AI files (90 files, fingerprint ${'a'.repeat(12)}); golden set 75% (3 of 4 posts)`,
    });
  });

  it.each([
    ['no committed results', null, 'there is no committed eval/results.json'],
    ['a run from before fingerprints', results({ hash: null }), 'run #24 has no fingerprint of the AI files'],
    ['AI files changed since', results({ hash: 'b'.repeat(64) }), 'the AI files changed since run #24'],
    ['other models', results({ model: 'some-model + other-model' }), 'run #24 used some-model + other-model, but CI uses'],
    ['a failed run', results({ passed: false }), 'run #24 did not pass the gate'],
    ['a pass that fails when worked out again', results({ themeOk: [true, false, false, false] }), 'run #24 fails the gate when worked out again: Golden set: theme agreement 25% (1 of 4 posts)'],
    ['golden posts read by the backup', results({ backup: true }), 'run #24 fails the gate when worked out again: Golden set: theme agreement'],
  ] as const)('runs the live eval for %s', (_what, file, reason) => {
    const decision = reuseDecision(file, current, models);
    expect(decision.reuse).toBe(false);
    expect(decision.reason).toContain(reason);
  });

  it("doesn't reuse today's committed run #23: it was made before fingerprints", () => {
    const committed = JSON.parse(readFileSync(path.join(process.cwd(), 'eval', 'results.json'), 'utf8')) as { run: { ai_files?: unknown } };
    if (committed.run.ai_files) return; // A newer committed run has one; the cases above cover it.
    expect(reuseDecision(committed, aiFilesFingerprint(), models).reuse).toBe(false);
  });

  it('npm run eval writes the fingerprint into eval/results.json', () => {
    const summary = { runId: 24, date: 'd', commit: 'c', model: models, promptVersion: 'v11', passed: true, rows: [], disagreements: [], checkFailures: [] } as RunSummary;
    const report = { golden: { results: [] }, safety: { results: [], fallbackCorrect: { correct: 0, total: 0 }, mustPass: {}, routing: {} }, passed: true, reasons: [], invariantFailures: 0 };
    const withPrint = resultsJson({ ...report, aiFiles: current } as unknown as EvalReport, summary);
    expect(withPrint.run.ai_files).toEqual(current);
    expect(resultsJson(report as unknown as EvalReport, summary).run.ai_files).toBeNull();
  });
});
