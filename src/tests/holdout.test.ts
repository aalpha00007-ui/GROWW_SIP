// 1 Nov round 2, task 6: the holdout set (eval/holdout-set.json) and `npm run eval -- --set holdout`. Every AI
// reply is scripted: no call leaves this computer.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chosenSet, loadHoldoutSet, runHoldout, writeHoldoutResults } from '../eval/holdout';
import type { Llm } from '../llm/chat';
import { GOLDEN_COLUMNS, loadGoldenSet } from '../pipeline/loading/fixtures';
import { setupDatabase } from '../pipeline/loading/seed';
import { findPii } from '../pipeline/retrieval/pii';
import { pgliteDb } from './pglite-db';

/** Letters and digits in any script (Devanagari too), lower case, single spaces. */
const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

describe('The holdout set', () => {
  const rows = loadHoldoutSet();
  const golden = loadGoldenSet().rows;

  it("has 10 posts in the golden set's own fields, with unique ids", () => {
    expect(rows.map((r) => r.id)).toEqual(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10']);
    const file = JSON.parse(readFileSync(path.join(process.cwd(), 'eval', 'holdout-set.json'), 'utf8')) as Record<string, string>[];
    for (const post of file) expect(Object.keys(post)).toEqual([...GOLDEN_COLUMNS]);
  });

  it('is the same kinds of post as the golden set: the same sources', () => {
    const sources = new Set(golden.map((g) => g.source));
    for (const r of rows) expect(sources).toContain(r.source);
  });

  it('shares no post with the golden set', () => {
    const goldenTexts = golden.map((g) => norm(g.text));
    for (const r of rows) {
      const text = norm(r.text);
      expect(text.length).toBeGreaterThan(20);
      for (const g of goldenTexts) {
        expect(text).not.toBe(g);
        expect(g.includes(text.slice(0, 60)) || text.includes(g.slice(0, 60))).toBe(false);
      }
    }
  });

  it('has no personal details, so the eval sends every post', () => {
    for (const r of rows) expect(findPii(r.text).found, r.id).toEqual([]);
  });

  it('rejects a label that is not one of the 13 themes, and fields out of order', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'holdout-'));
    const post = { id: 'H01', source: 'App Store', text: 'A post', engine_theme: '', engine_behaviour: '', human_theme: 'Fees', human_behaviour: '' };
    writeFileSync(path.join(dir, 'bad.json'), JSON.stringify([post]));
    expect(() => loadHoldoutSet(path.join(dir, 'bad.json'))).toThrow('unknown theme "Fees"');
    writeFileSync(path.join(dir, 'order.json'), JSON.stringify([{ text: 'A post', id: 'H01' }]));
    expect(() => loadHoldoutSet(path.join(dir, 'order.json'))).toThrow('the fields must be');
  });
});

describe('npm run eval -- --set holdout', () => {
  it('picks the set from the command line; the full eval is the default', () => {
    expect(chosenSet([])).toBe('golden');
    expect(chosenSet(['--set', 'holdout'])).toBe('holdout');
    expect(chosenSet(['--set=holdout'])).toBe('holdout');
    expect(() => chosenSet(['--set', 'all'])).toThrow('--set must be golden or holdout');
  });

  it('reads only the labelled posts, scores them like the golden set, and writes the results without the post text', async () => {
    const db = pgliteDb();
    await setupDatabase(db, { today: '2026-10-27' });
    const post = (id: string, text: string, theme: string, behaviour = '') => ({
      id, source: 'App Store', text, engine_theme: '', engine_behaviour: '', human_themes: theme ? [theme] : [], human_behaviour: behaviour,
    });
    const rows = [post('H01', 'The app is great', 'App experience', 'Continuing'), post('H02', 'Markets crashed', 'Market fear'), post('H03', 'Not labelled yet', '')];
    const seen: string[] = [];
    const reader: Llm = {
      model: 'reader-model',
      async complete(messages) {
        const text = /<<<\n([\s\S]*)\n>>>/.exec(messages[1].content)![1];
        seen.push(text);
        const theme = text === 'The app is great' ? 'App experience' : 'Returns';
        return JSON.stringify({
          primary_theme: theme, themes: [theme], behaviour: 'Continuing', asks_for_advice: false, asks_for_prediction: false,
          misreads_cancel: false, language: 'en', confidence: 0.9, summary: 'A post',
        });
      },
    };
    const writer: Llm = { model: 'writer-model', complete: async () => { throw new Error('the holdout never writes an answer'); } };
    const report = await runHoldout({ db, llm: writer, reader, commitSha: 'abc1234def', promptVersion: 'v11', pauseMs: 0 }, rows);
    expect(seen).toEqual(['The app is great', 'Markets crashed']);
    expect(report).toMatchObject({ total: 3, themeAgreement: 0.5, behaviourAgreement: 1, readByBackup: 0, model: 'reader-model + writer-model' });

    const dir = mkdtempSync(path.join(tmpdir(), 'holdout-results-'));
    const [json, md] = writeHoldoutResults(report, dir, new Date('2026-11-01T06:30:00Z'));
    const written = readFileSync(json, 'utf8');
    expect(JSON.parse(written)).toMatchObject({
      run: { date: '1 Nov 2026, 12:00 IST', commit: 'abc1234def', prompt_version: 'v11' },
      set: 'holdout',
      scores: { theme_agreement: 0.5, theme_ok: 1, labelled: 2, total: 3, behaviour_agreement: 1, behaviour_ok: 1, behaviour_labelled: 1, read_by_backup: 0 },
    });
    // Real public posts: listed by id only.
    expect(written).not.toContain('The app is great');
    expect(readFileSync(md, 'utf8')).toContain('| Theme agreement | 50% (1 of 2 labelled posts) |');
  }, 120_000);
});
