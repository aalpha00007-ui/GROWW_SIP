// A fingerprint of the AI files: everything whose change makes CI run the eval (.github/workflows/ci.yml, "Did
// the AI change?"). `npm run eval` records it in eval/results.json, so CI can tell whether the committed results
// were made on exactly the code it is about to deploy, and reuse them instead of calling Groq again.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The AI files: prompts, checker and pipeline (src/pipeline), the model clients and their settings (src/llm),
 * the eval itself (src/eval), the schema (src/db), all data including the golden set and the guardrail lists
 * (data/), the workflows, and the dependencies. Must stay the same as the pattern in ci.yml (a test checks).
 */
export const AI_FILES = /^(src\/(pipeline|llm|eval|db)\/|data\/|\.github\/workflows\/|package(-lock)?\.json$)/;

/** Files Git knows about here: committed or new, but not ignored. Paths use forward slashes. */
export function gitFiles(root: string): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out.split('\0').filter(Boolean);
}

export interface Fingerprint {
  /** sha256 over every AI file's path and content, in path order. */
  hash: string;
  files: number;
}

/**
 * The same on Windows and in CI: line endings are read as \n, because Git checks text files out with \r\n on
 * Windows and \n on Linux. A file Git still lists but that was deleted is left out.
 */
export function aiFilesFingerprint(root = process.cwd(), files = gitFiles(root)): Fingerprint {
  const list = [...new Set(files.map((f) => f.replace(/\\/g, '/')))].filter((f) => AI_FILES.test(f) && existsSync(path.join(root, f))).sort();
  const hash = createHash('sha256');
  for (const file of list) {
    const content = readFileSync(path.join(root, file)).toString('latin1').replace(/\r\n/g, '\n');
    hash.update(`${file}\0`, 'utf8');
    hash.update(content, 'latin1');
    hash.update('\0', 'utf8');
  }
  return { hash: hash.digest('hex'), files: list.length };
}
