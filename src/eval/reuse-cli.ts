// npm run eval:reuse — for CI: can the committed eval/results.json stand in for a new eval run? Writes
// reuse=true or reuse=false to GITHUB_OUTPUT and says why. Makes no AI or database call.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { aiFilesFingerprint } from './fingerprint';
import { reuseDecision } from './reuse';

function main(): void {
  let results: unknown = null;
  try {
    results = JSON.parse(readFileSync(path.join(process.cwd(), 'eval', 'results.json'), 'utf8'));
  } catch {
    // No file, or not JSON: the decision says so.
  }
  const current = aiFilesFingerprint();
  const { reuse, reason } = reuseDecision(results, current);
  console.log(reuse ? `Reusing the committed eval: ${reason}.` : `Running the eval: ${reason}.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
}

main();
