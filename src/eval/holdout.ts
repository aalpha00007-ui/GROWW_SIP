// The holdout set (eval/holdout-set.json): 10 real posts from the same Evidence Log run as the golden set, picked
// by a fixed rule (eval/tuning-log.md), never used to write any prompt rule. Labelled by hand by the owner. It
// scores call 1 the same way as the golden set, is reported on /quality next to it, and never gates a deploy. It
// is no longer fully fresh: its results were seen before the reading prompt changed in v16 (eval/tuning-log.md).
//   npm run eval -- --set holdout
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client';
import type { Llm } from '../llm/chat';
import { BEHAVIOURS, GOLDEN_COLUMNS, THEMES, type GoldenRow } from '../pipeline/loading/fixtures';
import { clonePersona } from '../pipeline/loading/personas';
import { todayInIndia } from '../pipeline/loading/dates';
import { retrieveFacts } from '../pipeline/retrieval/facts';
import { DEFAULT_PAUSE_MS, EVAL_TAG, percent, readPosts, type GoldenResult } from './run';

export const HOLDOUT_FILE = path.join('eval', 'holdout-set.json');

/** `npm run eval -- --set holdout` runs the holdout set; the default is the full eval (golden set and cases). */
export function chosenSet(args: string[]): 'golden' | 'holdout' {
  const at = args.indexOf('--set');
  const value = at === -1 ? (args.find((a) => a.startsWith('--set='))?.slice('--set='.length) ?? 'golden') : args[at + 1];
  if (value !== 'golden' && value !== 'holdout') throw new Error(`--set must be golden or holdout, not "${value ?? ''}".`);
  return value;
}

/** The holdout posts, in the golden set's own fields, with the hand labels read the same way. */
export function loadHoldoutSet(file = path.join(process.cwd(), HOLDOUT_FILE)): GoldenRow[] {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>[];
  if (!Array.isArray(rows)) throw new Error(`${file} must be a JSON array of posts.`);
  const ids = new Set<string>();
  return rows.map((r, i) => {
    const where = `${file}, item ${i + 1}`;
    const keys = Object.keys(r);
    if (keys.join(',') !== GOLDEN_COLUMNS.join(',')) throw new Error(`${where}: the fields must be ${GOLDEN_COLUMNS.join(', ')}, in that order.`);
    for (const key of GOLDEN_COLUMNS) if (typeof r[key] !== 'string') throw new Error(`${where}: ${key} must be text (empty when not labelled).`);
    const s = (key: (typeof GOLDEN_COLUMNS)[number]) => (r[key] as string).trim();
    if (!s('id') || !s('text')) throw new Error(`${where}: id and text are required.`);
    if (ids.has(s('id'))) throw new Error(`${where}: id ${s('id')} is used twice.`);
    ids.add(s('id'));
    const human_themes = s('human_theme') ? s('human_theme').split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (human_themes.length > 3) throw new Error(`${where}: at most 3 human themes.`);
    for (const t of human_themes) if (!(THEMES as readonly string[]).includes(t)) throw new Error(`${where}: unknown theme "${t}". Use one of: ${THEMES.join(', ')}.`);
    const human_behaviour = s('human_behaviour');
    if (human_behaviour && !(BEHAVIOURS as readonly string[]).includes(human_behaviour)) {
      throw new Error(`${where}: unknown behaviour "${human_behaviour}". Use one of: ${BEHAVIOURS.join(', ')}.`);
    }
    return { id: s('id'), source: s('source'), text: s('text'), engine_theme: s('engine_theme'), engine_behaviour: s('engine_behaviour'), human_themes, human_behaviour };
  });
}

export interface HoldoutReport {
  commitSha: string;
  model: string;
  promptVersion: string;
  total: number;
  results: GoldenResult[];
  themeAgreement: number;
  behaviourAgreement: number | null;
  readByBackup: number;
}

/** Call 1 on each labelled holdout post, with Riya's first SIP as the facts, as the golden set is read. */
export async function runHoldout(
  deps: { db: Db; llm: Llm; reader?: Llm | null; commitSha: string; promptVersion: string; today?: string; pauseMs?: number; log?: (line: string) => void },
  rows: GoldenRow[],
): Promise<HoldoutReport> {
  const log = deps.log ?? (() => {});
  const pauseMs = deps.pauseMs ?? DEFAULT_PAUSE_MS;
  let calls = 0;
  const pause = async () => {
    if (calls++ > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  };
  let facts: Awaited<ReturnType<typeof retrieveFacts>> | undefined;
  const riyaFacts = async () => {
    if (!facts) {
      const investorId = await clonePersona(deps.db, 'riya');
      await deps.db.query('UPDATE investors SET display_name = display_name || $2 WHERE id = $1', [investorId, EVAL_TAG]);
      const [sip] = (await deps.db.query<{ id: number }>('SELECT id FROM sips WHERE investor_id = $1 ORDER BY id LIMIT 1', [investorId])).rows;
      facts = await retrieveFacts(deps.db, investorId, sip.id, deps.today ?? todayInIndia());
    }
    if (facts.status !== 'ok') throw new Error(`The riya persona's first SIP could not be read (${facts.status}).`);
    return facts.unit;
  };
  const labelled = rows.filter((r) => r.human_themes.length > 0);
  const results = await readPosts({ reader: deps.reader, llm: deps.llm, log, pause, set: 'holdout', fixFile: HOLDOUT_FILE }, labelled, riyaFacts);
  const withBehaviour = results.filter((r) => r.behaviourOk !== null);
  return {
    commitSha: deps.commitSha,
    model: deps.reader ? `${deps.reader.model} + ${deps.llm.model}` : deps.llm.model,
    promptVersion: deps.promptVersion,
    total: rows.length,
    results,
    themeAgreement: results.length ? results.filter((r) => r.themeOk).length / results.length : 0,
    behaviourAgreement: withBehaviour.length ? withBehaviour.filter((r) => r.behaviourOk).length / withBehaviour.length : null,
    readByBackup: deps.reader ? results.filter((r) => 'model' in r.got && r.got.model !== deps.reader!.model).length : 0,
  };
}

const WHEN = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** eval/holdout-results.json and .md. Posts by id only, without their text: they are real public posts. */
export function writeHoldoutResults(report: HoldoutReport, dir = path.join(process.cwd(), 'eval'), now = new Date()): string[] {
  mkdirSync(dir, { recursive: true });
  const themeOk = report.results.filter((r) => r.themeOk).length;
  const behaviour = report.results.filter((r) => r.behaviourOk !== null);
  const json = {
    run: { date: `${WHEN.format(now)} IST`, commit: report.commitSha, model: report.model, prompt_version: report.promptVersion },
    set: 'holdout',
    scores: {
      theme_agreement: report.themeAgreement,
      theme_ok: themeOk,
      labelled: report.results.length,
      total: report.total,
      behaviour_agreement: report.behaviourAgreement,
      behaviour_ok: behaviour.filter((r) => r.behaviourOk).length,
      behaviour_labelled: behaviour.length,
      read_by_backup: report.readByBackup,
    },
    results: report.results.map(({ text: _text, ...rest }) => rest),
  };
  const got = (r: GoldenResult) => ('error' in r.got ? `No reading: ${r.got.error}` : `${r.got.primary_theme} / ${r.got.behaviour} (confidence ${r.got.confidence})`);
  const md = [
    '# Holdout results',
    '',
    `${json.run.date} · commit ${report.commitSha.slice(0, 7)} · ${report.model} · prompt ${report.promptVersion}`,
    '',
    'Reported only: the holdout never gates a deploy. Its posts were never used to write a prompt rule, but its results were first seen on prompt v11 and the reading prompt changed in v16, so it is no longer fully fresh (eval/tuning-log.md).',
    '',
    '| Measure | Result |',
    '| --- | --- |',
    `| Theme agreement | ${percent(report.themeAgreement)} (${themeOk} of ${report.results.length} labelled posts) |`,
    `| Behaviour | ${report.behaviourAgreement === null ? 'No labels' : `${percent(report.behaviourAgreement)} (${json.scores.behaviour_ok} of ${behaviour.length})`} |`,
    `| Not labelled yet | ${report.total - report.results.length} of ${report.total} |`,
    `| Read by the backup model | ${report.readByBackup} |`,
    '',
    '| Post | Label | AI output | Match |',
    '| --- | --- | --- | --- |',
    ...report.results.map((r) => `| ${r.id} | ${r.expected.themes.join(' or ')} / ${r.expected.behaviour || '-'} | ${got(r)} | ${r.themeOk ? 'yes' : 'no'} |`),
    '',
  ].join('\n');
  const files = [path.join(dir, 'holdout-results.json'), path.join(dir, 'holdout-results.md')];
  writeFileSync(files[0], `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(files[1], md);
  return files;
}
