// Phase 2 commands: `npm run chunks:build`, `npm run chunks:check`.
import { checkExplainerChunks, EXPLAINER_CHUNKS_FILE, writeExplainerChunks } from './explainers';

function main(command: string | undefined): void {
  if (command === 'build') {
    const chunks = writeExplainerChunks();
    console.log(`Wrote data/${EXPLAINER_CHUNKS_FILE}: ${chunks.length} chunks, one per explainer, none split`);
    for (const c of chunks) console.log(`  ${c.id} (${c.status}) ${c.sha256.slice(0, 12)}`);
    const drafts = chunks.filter((c) => c.status === 'draft').length;
    if (drafts > 0) console.log(`  warning: ${drafts} explainers are drafts; approve the wording in data/raw/explainers/.`);
  } else if (command === 'check') {
    checkExplainerChunks();
    console.log(`data/${EXPLAINER_CHUNKS_FILE} matches data/raw/explainers`);
  } else {
    throw new Error('Usage: cli.ts build | check');
  }
}

try {
  main(process.argv[2]);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
