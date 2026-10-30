// The header's More menu on the landing page, logged out (npm run e2e): it opens a menu, never the sign-up modal,
// and each of its nine items opens the right page or demo with no login.
import { expect, test, type Page } from '@playwright/test';

const LINKS = [
  { title: 'SIP calculator', path: '/calculators/sip', heading: 'SIP calculator' },
  { title: 'Goal planner', path: '/calculators/goal', heading: 'Goal planner' },
  { title: 'SWP calculator', path: '/calculators/swp', heading: 'SWP calculator' },
  { title: 'How the AI works', path: '/about/ai', heading: 'How the AI works' },
  { title: 'About this prototype', path: '/about', heading: 'About this prototype' },
  { title: 'SIP basics', path: '/learn/sip-basics', heading: 'SIP basics' },
];

const DEMOS = [
  { title: 'Set a goal for a SIP', path: '/fund/2', name: 'Kabir', shows: 'Add a goal' },
  { title: 'See the dip in context', path: '/dashboard', name: 'Riya', shows: 'Your goals' },
  { title: 'Check in before you stop', path: '/sips', name: 'Arjun', shows: 'Stop SIP' },
];

const ORDER = ['SIP calculator', 'Goal planner', 'SWP calculator', ...DEMOS.map((d) => d.title), 'How the AI works', 'About this prototype', 'SIP basics'];

const moreButton = (page: Page) => page.getByRole('button', { name: 'More', exact: true });
const menu = (page: Page) => page.locator('#more-menu');

async function openMenu(page: Page) {
  await page.goto('/');
  await moreButton(page).click();
  await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page)).toBeVisible();
}

test('More opens a menu, not the sign-up modal, and the URL does not change', async ({ page }) => {
  await openMenu(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const title of ORDER) await expect(menu(page).getByText(title, { exact: true })).toBeVisible();
  // Every item works without logging in: none of them points at the sign-up modal.
  for (const href of await menu(page).locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href')))) {
    expect(href).not.toContain('auth=');
  }
});

test('a click outside closes it', async ({ page }) => {
  await openMenu(page);
  // The banner above the header: outside the menu on every screen size.
  await page.getByRole('note').click();
  await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(menu(page)).toBeHidden();
});

test('keyboard: Enter opens, Tab walks the nine items, Esc closes and returns focus to More', async ({ page, isMobile }) => {
  test.skip(isMobile, 'A keyboard check, run once on desktop.');
  await page.goto('/');
  await moreButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'true');
  const seen: string[] = [];
  for (let i = 0; i < ORDER.length; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement?.querySelector('span')?.textContent ?? ''));
  }
  expect(seen).toEqual(ORDER);
  await page.keyboard.press('Escape');
  await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(moreButton(page)).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
});

for (const link of LINKS) {
  test(`${link.title} opens ${link.path} with no login`, async ({ page }) => {
    await openMenu(page);
    await menu(page).getByRole('link', { name: link.title }).click();
    await expect(page).toHaveURL(link.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(link.heading);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: 'Log in / Sign up' })).toBeVisible();
  });
}

for (const demo of DEMOS) {
  test(`${demo.title} starts ${demo.name}'s demo and opens ${demo.path}`, async ({ page }) => {
    await openMenu(page);
    await menu(page).getByRole('button', { name: demo.title }).click();
    await expect(page).toHaveURL(demo.path, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Account menu' })).toContainText(demo.name);
    await expect(page.getByText(demo.shows).first()).toBeVisible();
    // Leave no test data behind: end this demo copy and delete it.
    expect((await page.request.post('/api/account/delete')).ok()).toBe(true);
  });
}
