// Fixed text and eval fixtures that live in the repo (architecture decision D1), so each
// commit's eval tests exactly what that commit deploys.
import { check, PERSONA_KEYS, readDataFile, type PersonaKey } from './raw';

export const EXPLAINER_KEYS = ['stop', 'skip', 'pause', 'lower_amount'] as const;
export type ExplainerKey = (typeof EXPLAINER_KEYS)[number];

export interface Explainer {
  key: ExplainerKey;
  title: string;
  /** 'draft' until the wording is approved (an open item in the architecture). */
  status: 'draft' | 'approved';
  text: string;
}

export function loadExplainers(): Record<ExplainerKey, Explainer> {
  const explainers = {} as Record<ExplainerKey, Explainer>;
  for (const key of EXPLAINER_KEYS) {
    const file = `raw/explainers/${key}.md`;
    const raw = readDataFile(file).replace(/\r\n/g, '\n');
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    check(match, file, 'must start with a --- front matter block');
    const meta = Object.fromEntries(
      match[1].split('\n').map((line) => {
        const colon = line.indexOf(':');
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
    );
    check(meta.key === key, file, `front matter key must be "${key}"`);
    check(meta.title, file, 'front matter needs a title');
    check(meta.status === 'draft' || meta.status === 'approved', file, 'front matter status must be draft or approved');
    const text = match[2].trim();
    check(text.length > 0, file, 'has no text');
    explainers[key] = { key, title: meta.title, status: meta.status, text };
  }
  return explainers;
}

export interface AdvicePattern {
  lang: 'en' | 'hi' | 'hinglish';
  pattern: string;
  regex: RegExp;
}

export function loadAdvicePatterns(): AdvicePattern[] {
  const file = 'raw/guardrails/advice_patterns.json';
  const patterns = JSON.parse(readDataFile(file)).patterns;
  check(Array.isArray(patterns) && patterns.length > 0, file, 'needs a non-empty "patterns" list');
  return patterns.map((p: { lang: string; pattern: string }) => {
    check(p.lang === 'en' || p.lang === 'hi' || p.lang === 'hinglish', file, `"${p.pattern}": lang must be en, hi or hinglish`);
    check(typeof p.pattern === 'string' && p.pattern.trim(), file, 'every pattern needs text');
    let regex: RegExp;
    try {
      regex = new RegExp(p.pattern, 'iu');
    } catch (err) {
      throw new Error(`${file}: "${p.pattern}" is not a valid pattern: ${(err as Error).message}`);
    }
    return { lang: p.lang, pattern: p.pattern, regex } as AdvicePattern;
  });
}

// The Evidence Log's labels (build spec §9, Step 1), so the golden set can score the AI directly.
export const THEMES = [
  'Confusion', 'Returns', 'KYC & onboarding', 'Payment & mandate issues', 'App experience',
  'Charges & fees', 'Market fear', 'Need money', 'Trust & safety', 'Expectation mismatch',
  'Customer support', 'Other', 'Not relevant',
] as const;
export const BEHAVIOURS = ['Started', 'Continuing', 'Paused', 'Reduced', 'Stopped', 'Not stated'] as const;

export const OUTCOMES = ['answer', 'fallback', 'declined'] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const ROUTES = ['doubt', 'explain', 'cash', 'autopay', 'neutral'] as const;
export type Route = (typeof ROUTES)[number];

export interface EvalCase {
  id: string;
  persona: PersonaKey;
  moment: 'before_stop' | 'is_this_normal';
  text: string;
  expected: {
    outcome: Outcome;
    route?: Route;
    asks_for_advice?: boolean;
    misreads_cancel?: boolean;
  };
}

export function loadEvalCases(): EvalCase[] {
  const file = 'eval/cases/cases.json';
  const cases: EvalCase[] = JSON.parse(readDataFile(file));
  check(Array.isArray(cases) && cases.length > 0, file, 'must be a non-empty list');
  const ids = new Set<string>();
  for (const c of cases) {
    const where = `case ${c.id ?? '?'}`;
    check(/^s\d{2}$/.test(c.id) && !ids.has(c.id), file, `${where}: ids must be unique and look like s01`);
    ids.add(c.id);
    check(PERSONA_KEYS.includes(c.persona), file, `${where}: unknown persona "${c.persona}"`);
    check(c.moment === 'before_stop' || c.moment === 'is_this_normal', file, `${where}: moment must be before_stop or is_this_normal`);
    check(typeof c.text === 'string', file, `${where}: text must be a string`);
    if (c.moment === 'before_stop') {
      check(c.text.length >= 1 && c.text.length <= 500, file, `${where}: a before_stop reason must be 1-500 characters`);
    } else {
      check(c.text === '', file, `${where}: is_this_normal has no user text`);
    }
    const e = c.expected;
    check(e && OUTCOMES.includes(e.outcome), file, `${where}: expected.outcome must be one of ${OUTCOMES.join(', ')}`);
    check(e.route === undefined || (e.outcome === 'answer' && ROUTES.includes(e.route)), file, `${where}: expected.route must be a route, and only on an answer`);
    for (const flag of ['asks_for_advice', 'misreads_cancel'] as const) {
      check(e[flag] === undefined || typeof e[flag] === 'boolean', file, `${where}: expected.${flag} must be true or false`);
    }
  }
  return cases;
}

export const GOLDEN_COLUMNS = ['id', 'source', 'text', 'engine_theme', 'engine_behaviour', 'human_theme', 'human_behaviour'] as const;

export interface GoldenRow {
  id: string;
  source: string;
  text: string;
  engine_theme: string;
  engine_behaviour: string;
  /** Up to 3 themes; empty until the post is hand-labelled. */
  human_themes: string[];
  human_behaviour: string;
}

export interface GoldenSet {
  rows: GoldenRow[];
  labelled: number;
  /** Rows with no human label; the eval skips and reports them (build spec §11). */
  skipped: number;
}

export function loadGoldenSet(): GoldenSet {
  const file = 'eval/golden_set/golden_set.csv';
  const [header, ...records] = parseCsv(readDataFile(file));
  check(header && header.join(',') === GOLDEN_COLUMNS.join(','), file, `header must be ${GOLDEN_COLUMNS.join(',')}`);
  const rows = records.map((r, i): GoldenRow => {
    const where = `row ${i + 2}`;
    check(r.length === GOLDEN_COLUMNS.length, file, `${where}: expected ${GOLDEN_COLUMNS.length} columns, found ${r.length}`);
    const [id, source, text, engine_theme, engine_behaviour, humanTheme, human_behaviour] = r.map((f) => f.trim());
    const human_themes = humanTheme ? humanTheme.split(',').map((t) => t.trim()).filter(Boolean) : [];
    check(id && text, file, `${where}: id and text are required`);
    check(human_themes.length <= 3, file, `${where}: at most 3 human themes`);
    for (const t of human_themes) check((THEMES as readonly string[]).includes(t), file, `${where}: unknown theme "${t}"`);
    check(!human_behaviour || (BEHAVIOURS as readonly string[]).includes(human_behaviour), file, `${where}: unknown behaviour "${human_behaviour}"`);
    return { id, source, text, engine_theme, engine_behaviour, human_themes, human_behaviour };
  });
  const labelled = rows.filter((r) => r.human_themes.length > 0).length;
  return { rows, labelled, skipped: rows.length - labelled };
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ''));
}
