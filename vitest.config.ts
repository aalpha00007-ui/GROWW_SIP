import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve('src') } },
  // Unit tests never reach a real AI service (src/tests/no-live-ai.ts).
  test: { setupFiles: ['src/tests/no-live-ai.ts'] },
});
