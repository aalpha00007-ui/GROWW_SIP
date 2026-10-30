// End-to-end tests (npm run e2e): a real Chrome against a running app, http://localhost:3000 by default
// (E2E_BASE_URL to point elsewhere). Start the app first (npm run dev, or npm run build && npm start). It uses the
// Google Chrome already installed, so there is no browser download.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'src/e2e',
  testMatch: '*.e2e.ts',
  // Starting a demo copies a persona, which takes a few seconds (longer while the dev server compiles).
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [['list']],
  outputDir: '.e2e-results',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', channel: 'chrome', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { channel: 'chrome', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
