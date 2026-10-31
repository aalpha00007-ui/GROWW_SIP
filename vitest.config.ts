import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unit tests never reach a real AI service (src/tests/no-live-ai.ts).
  test: { setupFiles: ['src/tests/no-live-ai.ts'] },
});
