// Run once, after the deploy that removes the demo control: npx tsx src/server/clear-simulations-cli.ts
// With no flag it only counts. It deletes only with --yes, and it can't be undone.
import { connectNeon } from '../db/client';
import { loadEnvFiles } from '../env';
import { clearSimulations, countSimulations } from './clear-simulations';

async function main(yes: boolean): Promise<void> {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is empty. Set it in .env or .env.local.');
  const db = connectNeon(url);
  try {
    if (!yes) {
      const { rows, accounts } = await countSimulations(db);
      console.log(`${rows} simulated price rows across ${accounts} accounts. Nothing was deleted. Add --yes to delete them.`);
      return;
    }
    const { rows, accounts } = await clearSimulations(db);
    console.log(`Deleted ${rows} simulated price rows across ${accounts} accounts.`);
  } finally {
    await db.close();
  }
}

main(process.argv.includes('--yes')).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
