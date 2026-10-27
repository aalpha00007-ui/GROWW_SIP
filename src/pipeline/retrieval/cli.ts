// Try the retrieval backend against Neon without the app:
//   npm run retrieve -- facts riya [sip]          the facts unit and goal card for a SIP
//   npm run retrieve -- ask riya "<reason>" [sip] Before you stop, end to end
//   npm run retrieve -- normal riya [sip]         "What does this dip mean for my goal?"
//   npm run retrieve -- fall riya                 Simulate a market fall for the test visitor
//   npm run retrieve -- log riya                  The last 5 ai_checks rows for the test visitor
//   npm run retrieve -- fresh riya                Start a new test visitor (a clean copy)
// [sip] is the SIP's position for that persona: 1 (default), 2, 3.
import { connectNeon, type Db } from '../../db/client';
import { loadEnvFiles } from '../../env';
import { groqFromEnv, mistralFromEnv } from '../../llm/chat';
import { todayInIndia } from '../loading/dates';
import { PERSONA_KEYS, type PersonaKey } from '../loading/raw';
import { applyMarketFall } from '../loading/market-fall';
import { clonePersona } from '../loading/personas';
import { runCheckIn, type CheckInResult } from './checkin';
import { retrieveFacts } from './facts';

const CLI_TAG = ' · CLI test';

async function main(args: string[]): Promise<void> {
  const [command, persona, ...rest] = args;
  const commands = ['facts', 'ask', 'normal', 'fall', 'log', 'fresh'];
  if (!commands.includes(command) || !PERSONA_KEYS.includes(persona as PersonaKey)) {
    throw new Error(`Usage: npm run retrieve -- <${commands.join('|')}> <${PERSONA_KEYS.join('|')}> ["reason"] [sip]`);
  }

  loadEnvFiles();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is empty. Set it in .env or .env.local.');
  const db = connectNeon(process.env.DATABASE_URL);
  try {
    const visitor = await testVisitor(db, persona as PersonaKey, command === 'fresh');
    if (command === 'fresh') {
      console.log(`New test visitor for ${persona}: ${visitor}`);
      return;
    }
    if (command === 'fall') {
      const rows = await applyMarketFall(db, visitor);
      console.log(`Added a -6% day for ${rows.length} funds, dated ${rows[0].nav_date}, for ${persona}'s test visitor only.`);
      return;
    }
    if (command === 'log') {
      const rows = (
        await db.query(
          `SELECT id, created_at::text, moment, outcome, route, model, user_choice, latency_ms, user_text
           FROM ai_checks WHERE investor_id = $1 ORDER BY id DESC LIMIT 5`,
          [visitor],
        )
      ).rows;
      console.table(rows);
      return;
    }

    const sipNo = Number(command === 'ask' ? rest[1] ?? 1 : rest[0] ?? 1);
    const sip = await sipAt(db, visitor, sipNo);
    console.log(`\n== ${persona} · SIP ${sipNo}: ${sip.fund} · test visitor ${visitor.slice(0, 8)}`);

    if (command === 'facts') {
      const lookup = await retrieveFacts(db, visitor, sip.id, todayInIndia());
      if (lookup.status !== 'ok') return console.log(lookup.status === 'stopped' ? 'This SIP is already stopped.' : 'SIP not found.');
      console.log(`Goal card: ${lookup.goalLine}\n\n${lookup.unit.text}\n\nNumbers the grounding check accepts: ${lookup.unit.numbers.join(' | ')}`);
      return;
    }

    const llm = mistralFromEnv();
    if (!llm) console.log('Note: MISTRAL_API_KEY is not set in .env, so the AI steps fail and you will see the fallback card.');
    const result = await runCheckIn(
      { db, llm, reader: groqFromEnv(), promptVersion: process.env.PROMPT_VERSION, log: (line) => console.log(`[server log] ${line}`) },
      { investorId: visitor, sipId: sip.id, moment: command === 'ask' ? 'before_stop' : 'is_this_normal', text: rest[0] },
    );
    print(result);
  } finally {
    await db.close();
  }
}

/** A reusable copy of the persona, tagged so it is easy to tell apart from real demo visitors. */
async function testVisitor(db: Db, persona: PersonaKey, fresh: boolean): Promise<string> {
  if (!fresh) {
    const [found] = (
      await db.query<{ id: string }>(
        'SELECT id FROM investors WHERE persona_key = $1 AND display_name LIKE $2 ORDER BY created_at DESC LIMIT 1',
        [persona, `%${CLI_TAG}`],
      )
    ).rows;
    if (found) return found.id;
  }
  const id = await clonePersona(db, persona);
  await db.query('UPDATE investors SET display_name = display_name || $2 WHERE id = $1', [id, CLI_TAG]);
  return id;
}

async function sipAt(db: Db, investorId: string, position: number): Promise<{ id: number; fund: string }> {
  const [sip] = (
    await db.query<{ id: number; fund: string }>(
      'SELECT s.id, f.name AS fund FROM sips s JOIN funds f ON f.id = s.fund_id WHERE s.investor_id = $1 ORDER BY s.id OFFSET $2 LIMIT 1',
      [investorId, Math.max(0, position - 1)],
    )
  ).rows;
  if (!sip) throw new Error(`This persona has no SIP ${position}.`);
  return sip;
}

function print(r: CheckInResult): void {
  if (r.status !== 200) {
    console.log(`HTTP ${r.status}: ${r.error}`);
    return;
  }
  const ok = (pass: boolean) => (pass ? 'ok' : 'FAIL');
  console.log(`Outcome:    ${r.outcome}${r.route ? ` · route ${r.route}` : ''} · ${r.latencyMs} ms · ai_checks #${r.aiCheckId}`);
  if (r.understood) {
    console.log(`Understood: "${r.understood.summary}" (${r.understood.language}, confidence ${r.understood.confidenceLabel} ${r.understood.confidence})`);
  }
  console.log(`Goal card:  ${r.goalLine}`);
  console.log(`\n${r.text}\n`);
  if (r.checks) {
    const c = r.checks;
    console.log(`Quality:    no advice ${ok(c.no_advice)} · numbers match ${ok(c.grounded)} · disclaimer ${ok(c.disclaimer)} · ${c.words} words ${ok(c.length)}`);
    if (c.advice_found.length) console.log(`            advice found: ${c.advice_found.join(', ')}`);
    if (c.ungrounded.length) console.log(`            numbers not in the facts: ${c.ungrounded.join(', ')}`);
  }
  if (r.outcome !== 'answer') console.log(`${r.facts.text}\n`);
  console.log(`Numbers as of ${r.facts.as_of}`);
  console.log(`Options:    ${r.options.map((o) => o.label).join(' | ')}`);
  console.log(`Learn more: ${r.links.map((l) => `${l.label} ${l.url}`).join(' · ')}`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
