// The brief bans steering toward funds or stocks and fear, FOMO or urgency nudges. This scans every string a visitor
// can see: string literals and JSX text in src/app, src/components and src/server (comments are skipped), and the
// JSON values in data/raw. data/raw/guardrails is left out on purpose: it lists advice phrases ("best fund") so the
// checks can block them; nothing there is ever shown.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const BANNED = /\b(popular|highest|best|top traded|trending|closes in|closes tomorrow|hurry|last chance|don['’]t miss|limited)\b/i;
const ROOT = process.cwd();

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? files(full, ext) : ext.test(e.name) ? [full] : [];
  });
}

/** Every string literal, template piece and JSX text in a source file, with its line. */
function sourceStrings(file: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Every string value in a JSON file (keys are names in code, not text on screen). */
function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(jsonStrings);
  return [];
}

describe('No steering or urgency in anything a visitor sees', () => {
  it('has no "popular", "best", "closes in" or similar words in the app or the demo data', () => {
    const hits: string[] = [];
    for (const dir of ['src/app', 'src/components', 'src/server']) {
      for (const file of files(path.join(ROOT, dir), /\.tsx?$/)) {
        for (const s of sourceStrings(file)) if (BANNED.test(s.text)) hits.push(`${path.relative(ROOT, file)}:${s.line} "${s.text.trim()}"`);
      }
    }
    for (const file of files(path.join(ROOT, 'data/raw'), /\.json$/)) {
      if (file.includes(`${path.sep}guardrails${path.sep}`)) continue;
      for (const text of jsonStrings(JSON.parse(fs.readFileSync(file, 'utf-8')))) if (BANNED.test(text)) hits.push(`${path.relative(ROOT, file)} "${text}"`);
    }
    expect(hits).toEqual([]);
  });

  it('catches the words it is meant to catch', () => {
    for (const text of ['Popular funds', 'Highest 3Y return', 'Best fund', 'Top traded', 'Trending now', 'Closes in 3 days', 'Closes tomorrow', 'Hurry!', 'Last chance', "Don't miss it", 'Limited offer']) {
      expect(BANNED.test(text)).toBe(true);
    }
    expect(BANNED.test('Funds A–Z (demo)')).toBe(false);
  });
});
