// The regression suite (npm run e2e:regression): the real production build, against an in-memory database and a demo clock
// the tests control. It can't touch the live database or call an AI: DATABASE_URL and both keys are blanked for the
// server, which Next.js then won't fill in from .env. With no AI, every check-in shows the facts-only card, so the suite
// also proves that every manual action works without the AI.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'src/e2e',
  testMatch: ['regression*.e2e.ts', 'more-menu.e2e.ts', 'new-account.e2e.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One server, one database, one clock: the tests take turns.
  workers: 1,
  reporter: [['list']],
  outputDir: '.e2e-results',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { channel: 'chrome', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/about`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_PGLITE: '1',
      E2E_CLOCK: '1',
      E2E_SEED_DATE: '2026-10-27',
      DATABASE_URL: '',
      GROQ_API_KEY: '',
      MISTRAL_API_KEY: '',
    },
  },
});
