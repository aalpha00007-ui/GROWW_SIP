import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 3 is deliberately empty (architecture decision D3; PRD §3.3, step 2a): every lookup is by
// key, so nothing is embedded. These checks keep it that way until the PRD and architecture change.
describe('embedding phase (not used)', () => {
  it('keeps data/embeddings empty apart from its README', () => {
    expect(fs.readdirSync(path.join(process.cwd(), 'data', 'embeddings'))).toEqual(['README.md']);
  });

  it('adds no embedding or vector-search library', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const libraries = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const embeddingLibraries = /embed|vector|langchain|llamaindex|openai|cohere|pinecone|chroma|qdrant|weaviate|faiss|transformers/i;
    expect(libraries.filter((name) => embeddingLibraries.test(name))).toEqual([]);
  });
});
