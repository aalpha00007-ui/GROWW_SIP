// A brand-new demo account starts clean, on desktop and on a phone (npm run e2e): the header's logo, and no SIPs,
// holdings, positions, orders or watchlist it didn't make. Each run signs up one account per screen size and deletes it at
// the end. Sign-ups are limited to 5 an hour per network, so run this file at most twice an hour.
import { expect, test } from '@playwright/test';

const EMPTY = [
  ['/stocks/holdings', 'No stock holdings yet'],
  ['/stocks/positions', 'No open positions'],
  ['/stocks/orders', 'No stock orders yet'],
  ['/stocks/watchlist', 'Your watchlist is empty'],
  ['/fo/positions', 'No open F&O positions'],
  ['/fo/orders', 'No F&O orders yet'],
  ['/sips', 'No SIPs yet'],
  ['/dashboard', 'Nothing invested yet'],
  ['/cart', 'Your cart is empty'],
] as const;
/** The start of the logo mark's path in components/logo.tsx: the same mark wherever it appears. */
const LOGO_MARK = 'svg path[d^="M1.9 23.57"]';

test('a new demo account has no holdings, positions, orders or watchlist, and the same logo everywhere', async ({ page }, info) => {
  // Nine pages after a sign-up: longer than the default, more so while the dev server compiles them.
  test.setTimeout(240_000);
  const username = `e2e-${info.project.name}-${Date.now().toString(36).slice(-5)}`;
  // A made-up PIN for this run only; the account is deleted at the end.
  const pin = String(1000 + Math.floor(Math.random() * 9000));

  await page.goto('/?auth=signup');
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator(LOGO_MARK)).toBeVisible();
  await dialog.getByLabel('Demo username').fill(username);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('heading', { name: 'Create a 4-digit demo PIN' })).toBeVisible();
  await dialog.getByLabel('Create a 4-digit demo PIN').fill(pin);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/explore', { timeout: 30_000 });

  try {
    for (const [path, empty] of EMPTY) {
      await page.goto(path);
      await expect(page.getByText(empty, { exact: false }).first()).toBeVisible();
      await expect(page.locator('main tbody tr')).toHaveCount(0);
      await expect(page.locator('header').locator(LOGO_MARK)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  } finally {
    expect((await page.request.post('/api/account/delete')).ok()).toBe(true);
  }
});
