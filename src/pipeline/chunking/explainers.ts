import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EXPLAINER_KEYS, loadExplainers, type Explainer, type ExplainerKey } from '../loading/fixtures';
import { check, DATA_DIR, DataError } from '../loading/raw';

export const EXPLAINER_CHUNKS_FILE = 'chunks/explainers.json';

export interface ExplainerChunk {
  /** 'explainer:stop' */
  id: string;
  key: ExplainerKey;
  title: string;
  status: Explainer['status'];
  text: string;
  /** Where the text was authored. */
  source: string;
  /** Of the text, so a logged answer can name the exact wording it used. */
  sha256: string;
}

/** One chunk per explainer, whole: they are short fixed texts, so splitting could only cut a rule in half. */
export function chunkExplainers(): ExplainerChunk[] {
  const explainers = loadExplainers();
  return EXPLAINER_KEYS.map((key) => ({
    id: `explainer:${key}`,
    key,
    title: explainers[key].title,
    status: explainers[key].status,
    text: explainers[key].text,
    source: `data/raw/explainers/${key}.md`,
    sha256: sha256(explainers[key].text),
  }));
}

/** The chunk file exactly as it should be on disk; no timestamps, so the same text always builds the same file. */
export function renderChunkFile(chunks: ExplainerChunk[]): string {
  return `${JSON.stringify({ chunks }, null, 2)}\n`;
}

export function writeExplainerChunks(): ExplainerChunk[] {
  const chunks = chunkExplainers();
  fs.writeFileSync(path.join(DATA_DIR, EXPLAINER_CHUNKS_FILE), renderChunkFile(chunks));
  return chunks;
}

/** Fails when data/chunks is missing or behind data/raw, so stale wording can never ship. */
export function checkExplainerChunks(): void {
  let onDisk: string;
  try {
    onDisk = fs.readFileSync(path.join(DATA_DIR, EXPLAINER_CHUNKS_FILE), 'utf8');
  } catch {
    throw new DataError(`${EXPLAINER_CHUNKS_FILE}: missing. Run npm run chunks:build.`);
  }
  compareChunkFile(onDisk);
}

export function compareChunkFile(onDisk: string): void {
  if (onDisk.replace(/\r\n/g, '\n') !== renderChunkFile(chunkExplainers())) {
    throw new DataError(`${EXPLAINER_CHUNKS_FILE}: out of date with data/raw/explainers. Run npm run chunks:build.`);
  }
}

/** The built chunks, keyed by mechanic, for retrieval to pick by route. */
export function loadExplainerChunks(): Record<ExplainerKey, ExplainerChunk> {
  return parseChunkFile(fs.readFileSync(path.join(DATA_DIR, EXPLAINER_CHUNKS_FILE), 'utf8'));
}

export function parseChunkFile(content: string): Record<ExplainerKey, ExplainerChunk> {
  const file = EXPLAINER_CHUNKS_FILE;
  const chunks: ExplainerChunk[] = JSON.parse(content).chunks;
  check(Array.isArray(chunks), file, 'needs a "chunks" list');
  check(chunks.map((c) => c.key).join(',') === EXPLAINER_KEYS.join(','), file, `must hold exactly ${EXPLAINER_KEYS.join(', ')}, in that order`);
  const byKey = {} as Record<ExplainerKey, ExplainerChunk>;
  for (const chunk of chunks) {
    check(chunk.id === `explainer:${chunk.key}`, file, `${chunk.key}: id must be explainer:${chunk.key}`);
    check(typeof chunk.text === 'string' && chunk.text.length > 0, file, `${chunk.key}: has no text`);
    check(chunk.sha256 === sha256(chunk.text), file, `${chunk.key}: text does not match its sha256; rebuild with npm run chunks:build`);
    byKey[chunk.key] = chunk;
  }
  return byKey;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
