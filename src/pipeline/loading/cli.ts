// Phase 1 commands: `npm run data:check`, `npm run db:setup`, `npm run db:verify`, `npm run db:reset`,
// and `npm run db:migrate` (the schema only, no seed: safe on every deploy, keeps every visitor's data).
import { connectNeon } from '../../db/client';
import { loadEnvFiles } from '../../env';
import { loadAdvicePatterns, loadEvalCases, loadExplainers, loadGoldenSet } from './fixtures';
import { loadMarket, loadPersonas } from './raw';
import { applySchema, setupDatabase, wipeDatabase } from './seed';
import { verifyDatabase } from './verify';

async function main(command: string | undefined): Promise<void> {
  if (command === 'check') {
    checkData();
    return;
  }
  if (command !== 'setup' && command !== 'verify' && command !== 'reset' && command !== 'migrate') {
    throw new Error('Usage: cli.ts check | setup | verify | reset | migrate');
  }

  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is empty. Paste your Neon connection string after DATABASE_URL= in .env or .env.local.');

  const db = connectNeon(url);
  try {
    if (command === 'migrate') {
      await applySchema(db);
      console.log('Schema applied (new tables and columns added; no data changed).');
    } else if (command === 'setup') {
      checkData();
      const s = await setupDatabase(db);
      console.log(`\nDatabase ready, as of ${s.today}`);
      console.log(`  funds ${s.funds} · NAV rows ${s.navRows}`);
      console.log(`  assets ${s.assets} · price rows ${s.priceRows} · IPOs ${s.ipos}`);
      for (const p of s.personas) console.log(`  persona ${p.key}: ${p.sips} SIPs, ${p.instalments} instalments`);
    } else if (command === 'verify') {
      const checks = await verifyDatabase(db);
      for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
      const failed = checks.filter((c) => !c.ok).length;
      console.log(failed === 0 ? '\nThe database holds everything the seed should have stored.' : `\n${failed} check(s) failed.`);
      if (failed > 0) process.exitCode = 1;
    } else {
      const dropped = await wipeDatabase(db);
      console.log(`Dropped ${dropped.length} tables. Run npm run db:setup to rebuild.`);
    }
  } finally {
    await db.close();
  }
}

/** Validates everything under data/ without a database, and prints what needs attention. */
function checkData(): void {
  const market = loadMarket();
  const personas = loadPersonas(market);
  const explainers = Object.values(loadExplainers());
  const patterns = loadAdvicePatterns();
  const cases = loadEvalCases();
  const golden = loadGoldenSet();

  console.log('Data check passed');
  console.log(`  market: ${market.funds.length} funds, ${market.assets.length} assets, ${market.ipos.length} IPOs`);
  console.log(`  personas: ${personas.map((p) => p.key).join(', ')}`);
  console.log(`  explainers: ${explainers.map((e) => `${e.key} (${e.status})`).join(', ')}`);
  console.log(`  advice patterns: ${patterns.length}`);
  console.log(`  eval cases: ${cases.length}`);
  console.log(`  golden set: ${golden.labelled} labelled, ${golden.skipped} without a label`);

  const drafts = explainers.filter((e) => e.status === 'draft');
  if (drafts.length > 0) {
    console.log(`  warning: ${drafts.length} explainers are drafts; approve the wording in data/raw/explainers/.`);
  }
  if (golden.labelled === 0) {
    console.log('  warning: the golden set has no labelled posts; add the 20 hand-labelled posts to data/eval/golden_set/golden_set.csv before running the eval.');
  }
}

main(process.argv[2]).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
