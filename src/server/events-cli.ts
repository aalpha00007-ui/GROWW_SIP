// `npm run events`: how many times each funnel event happened, by how many investors, and the
// goal-save rate (SIPs started with a goal, of all SIPs started). Test visitors are left out.
import { connectNeon } from '../db/client';
import { loadEnvFiles } from '../env';
import { eventReport } from './events';

async function main(): Promise<void> {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is empty. Paste your Neon connection string after DATABASE_URL= in .env or .env.local.');
  const db = connectNeon(url);
  try {
    const report = await eventReport(db);
    console.log('Event                     Events  Investors');
    for (const c of report.counts) console.log(`${c.event.padEnd(26)}${String(c.events).padStart(6)}  ${String(c.investors).padStart(9)}`);
    const rate = report.goalSaveRate === null ? 'no SIPs started yet' : `${(report.goalSaveRate * 100).toFixed(1)}%`;
    console.log(`\nGoal-save rate: ${rate} (${report.startedWithGoal} of ${report.sipsStarted} SIPs started with a goal)`);
    console.log('Test visitors (" · eval", " · CLI test") are left out.');
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
