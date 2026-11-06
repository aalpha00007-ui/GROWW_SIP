// What the regression tests share: the demo clock, a clean persona, and the steps every journey starts with.
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Prices stop at the seed date (playwright.regression.config.ts); the demo date runs on from there. */
export const DEMO_DAY = '2026-11-05';

export async function setClock(request: APIRequestContext, today: string) {
  const response = await request.post('/api/e2e/clock', { data: { today } });
  expect(response.ok(), 'The test clock must be on: this suite runs only on the regression server').toBe(true);
}

/** Kabir has no SIPs, so each test starts from nothing, in a fresh copy. */
export async function startClean(page: Page, persona = 'kabir') {
  const response = await page.request.post('/api/demo/start', { data: { persona } });
  expect(response.ok()).toBe(true);
}

let accounts = 0;

/**
 * A real account, signed in. A persona copy can't sign back in, so login tests need one. Each comes from its own made-up
 * address: the suite makes more than the 5 sign-ups an hour one network is allowed, and that limit is real, so it stays.
 * This only works here, with no proxy in front: on the live site Cloudflare's own header decides the network.
 */
export async function signUp(page: Page): Promise<{ username: string; pin: string }> {
  accounts += 1;
  const username = `otter-${Date.now().toString(36).slice(-6)}-${accounts}`;
  const pin = '4826';
  const response = await page.request.post('/api/auth/signup', { data: { username, pin }, headers: { 'x-forwarded-for': `203.0.113.${accounts}` } });
  expect(response.ok(), 'The test account must be created').toBe(true);
  return { username, pin };
}

/** Opens the fund page's order card with this amount and SIP date. */
export async function openFund(page: Page, { fund = 1, amount, day }: { fund?: number; amount?: number; day?: number } = {}) {
  await page.goto(`/fund/${fund}`);
  if (amount !== undefined) await page.getByLabel('SIP amount').fill(String(amount));
  if (day !== undefined) await pickDay(page, day);
}

export const dateButton = (page: Page) => page.getByRole('button', { name: /^SIP date: Monthly on/ });

/** Opens the calendar and picks a day, which closes it. */
export async function pickDay(page: Page, day: number) {
  await dateButton(page).click();
  await page.getByRole('button', { name: `Day ${day}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fills the goal step, which Start SIP has opened, and saves. `month` is 'YYYY-MM'. */
export async function saveGoalStep(page: Page, purpose: string, month: string, target?: number) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: purpose }).click();
  await dialog.getByLabel('Month').selectOption({ label: MONTHS[Number(month.slice(5)) - 1] });
  await dialog.getByLabel('Year').selectOption(month.slice(0, 4));
  if (target) await dialog.getByLabel('Target amount').fill(String(target));
  await expect(dialog.getByText(/about \d+ instalments/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save goal & start SIP' }).click();
  await expect(page.getByRole('heading', { name: 'SIP started' })).toBeVisible();
}

/** Starts a SIP with a goal and lands on its page; returns the SIP's id. */
export async function startSipWithGoal(page: Page, o: { amount: number; day: number; purpose?: string; month: string; target?: number; fund?: number }): Promise<string> {
  await openFund(page, { fund: o.fund, amount: o.amount, day: o.day });
  await page.getByRole('button', { name: 'Start SIP' }).click();
  await saveGoalStep(page, o.purpose ?? 'Home down payment', o.month, o.target);
  const id = /\/sips\/(\d+)\/started/.exec(page.url())![1];
  await page.goto(`/sips/${id}`);
  return id;
}

/** Starts a SIP with no goal; returns the SIP's id. */
export async function startSipNoGoal(page: Page, o: { amount: number; day: number; fund?: number }): Promise<string> {
  await openFund(page, { fund: o.fund, amount: o.amount, day: o.day });
  await page.getByRole('button', { name: 'Start SIP' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'SIP started' })).toBeVisible();
  const id = /\/sips\/(\d+)\/started/.exec(page.url())![1];
  await page.goto(`/sips/${id}`);
  return id;
}

/** Skip next on the SIP page, through its confirm step. */
export async function skipNext(page: Page) {
  await page.getByRole('button', { name: 'Skip next' }).click();
  await page.getByRole('button', { name: 'Yes, skip it' }).click();
  await expect(page.getByText(/^Skipped the /)).toBeVisible();
}

export async function pause(page: Page, count: 1 | 2 | 3) {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(`^${count} instalments?`) }).check();
  await page.locator('fieldset').getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText(/^Paused: /).first()).toBeVisible();
}

export async function changeAmount(page: Page, amount: number) {
  await page.getByRole('button', { name: 'Change amount' }).click();
  await page.getByLabel('New amount a month (Rs)').fill(String(amount));
  await page.getByRole('button', { name: 'Save amount' }).click();
  await expect(page.getByText(/^Your SIP is now /)).toBeVisible();
}

/** The demo balance from the account menu. */
export async function balance(page: Page): Promise<string> {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Account menu' }).click();
  const row = page.getByRole('link', { name: /Demo balance/ });
  const text = await row.innerText();
  await page.keyboard.press('Escape');
  return /₹[\d,]+/.exec(text)![0];
}
