// The regression suite: every journey the QA review covered, on the real production build (npm run e2e:regression).
import { expect, test, type Page } from '@playwright/test';
import { balance, changeAmount, dateButton, DEMO_DAY, openFund, pause, pickDay, setClock, signUp, skipNext, startClean, startSipNoGoal, startSipWithGoal } from './regression-helpers';

test.beforeEach(async ({ page, request }) => {
  await setClock(request, DEMO_DAY);
  await startClean(page);
});

test.describe('Starting a SIP', () => {
  test('direct, with a goal: the dashboard and the SIP page agree', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await expect(page.getByText('This SIP is for Home down payment · by Nov 2027 · 12 instalments to go')).toBeVisible();
    await expect(page.getByText('1 of 13 instalments paid · 12 instalments to go').first()).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('1 of 13 instalments paid · 12 instalments to go')).toBeVisible();
    await expect(page.getByText('of ₹13,000 planned')).toBeVisible();
  });

  test('direct, with no goal: skipping is one tap, and nothing invents a plan', async ({ page }) => {
    await startSipNoGoal(page, { amount: 1000, day: 5 });
    await expect(page.getByText('No goal yet')).toBeVisible();
    await expect(page.getByText('1 instalment paid', { exact: true }).first()).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('1 SIP has no goal yet')).toBeVisible();
  });

  test('from the cart, with a goal', async ({ page }) => {
    await openFund(page, { amount: 2000, day: 5 });
    await page.getByRole('button', { name: 'Add a goal' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Retirement' }).click();
    await dialog.getByLabel('Month').selectOption({ label: 'Mar' });
    await dialog.getByLabel('Year').selectOption('2030');
    await expect(dialog.getByText(/about \d+ instalments/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Save goal' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('is in your cart.')).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByText('For: Retirement · by Mar 2030')).toBeVisible();
    await page.getByRole('button', { name: 'Start SIP' }).click();
    await expect(page.getByRole('heading', { name: 'SIP started' })).toBeVisible();
    await expect(page.getByText('by Mar 2030')).toBeVisible();
    await page.goto('/cart');
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });

  test('from the cart, with no goal: the goal step opens, and skipping starts it', async ({ page }) => {
    await openFund(page, { amount: 2000, day: 5 });
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('is in your cart.')).toBeVisible();
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Start SIP' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { name: 'SIP started' })).toBeVisible();
  });
});

test.describe('Amount limits', () => {
  test('below the minimum: refused, and the error clears the moment the amount is right', async ({ page }) => {
    await openFund(page, { amount: 100 });
    await page.getByRole('button', { name: 'Start SIP' }).click();
    const error = page.getByRole('alert').filter({ hasText: 'Enter a whole amount' });
    await expect(error).toBeVisible();
    await page.getByLabel('SIP amount').fill('1000');
    await expect(error).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('above the maximum: refused, and no SIP is made', async ({ page }) => {
    await openFund(page, { amount: 100_001 });
    await page.getByRole('button', { name: 'Start SIP' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a whole amount' })).toBeVisible();
    await page.goto('/sips');
    await expect(page.getByText('No SIPs yet.')).toBeVisible();
  });

  test('exactly the minimum and exactly the maximum are taken', async ({ page }) => {
    await startSipNoGoal(page, { amount: 500, day: 5 });
    await expect(page.getByText('₹500 a month').first()).toBeVisible();
    await startClean(page);
    await startSipNoGoal(page, { amount: 100_000, day: 5 });
    await expect(page.getByText('₹1,00,000 a month').first()).toBeVisible();
  });
});

test('insufficient balance: a rejected order makes no SIP and takes no money', async ({ page }) => {
  await startSipNoGoal(page, { amount: 99_500, day: 5 });
  expect(await balance(page)).toBe('₹500');
  await page.goto('/sips');
  await expect(page.getByText('1 SIP · Demo orders')).toBeVisible();

  await openFund(page, { fund: 2, amount: 1000, day: 5 });
  await page.getByRole('button', { name: 'Start SIP' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('more than your demo balance of ₹500');

  expect(await balance(page)).toBe('₹500');
  await page.goto('/sips');
  await expect(page.getByText('1 SIP · Demo orders')).toBeVisible();
});

test.describe('Changing a SIP', () => {
  test('lowering the amount changes what is planned, not what was paid', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await changeAmount(page, 500);
    await expect(page.getByText('₹500 a month').first()).toBeVisible();
    await page.reload();
    await expect(page.getByText('Contribution progress: ₹1,000 of ₹7,000 planned')).toBeVisible();
    await expect(page.getByText('₹1,000 · Paid')).toBeVisible();
  });

  test('the amount error clears as soon as the amount is right', async ({ page }) => {
    await startSipNoGoal(page, { amount: 1000, day: 5 });
    await page.getByRole('button', { name: 'Change amount' }).click();
    await page.getByLabel('New amount a month (Rs)').fill('1');
    await page.getByRole('button', { name: 'Save amount' }).click();
    const error = page.getByText(/^Enter a whole amount\./);
    await expect(error).toBeVisible();
    await page.getByLabel('New amount a month (Rs)').fill('800');
    await expect(error).toHaveCount(0);
  });

  test('skip asks first, and Undo puts the instalment back', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await page.getByRole('button', { name: 'Skip next' }).click();
    await expect(page.getByText(/Skip the 5 Dec 2026 instalment\? It won't be taken later/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByText('0 past skips · 0 scheduled skips').first()).toBeVisible();

    await skipNext(page);
    await page.reload();
    await expect(page.getByText('0 past skips · 1 scheduled skip').first()).toBeVisible();
    await expect(page.getByText('Next instalment: 5 Jan 2027')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('The 5 Dec 2026 instalment is back on.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Next instalment: 5 Dec 2026')).toBeVisible();
    await expect(page.getByText('0 past skips · 0 scheduled skips').first()).toBeVisible();
  });

  /** The bug the QA review found: "9 to go" on one screen, "1 of 13 paid" on another. */
  test('skip then pause: one story on every screen', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2031-03' });
    await changeAmount(page, 500);
    await skipNext(page);
    await pause(page, 2);

    await page.goto(`/sips/${id}/goal`);
    await page.getByLabel('Month').selectOption({ label: 'Nov' });
    await page.getByLabel('Year').selectOption('2027');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('Goal saved.')).toBeVisible();

    const line = '1 of 10 instalments paid · 9 instalments to go';
    const skips = '0 past skips · 3 scheduled skips';
    await expect(page.getByText('This SIP is for Home down payment · by Nov 2027 · 9 instalments to go')).toBeVisible();
    await expect(page.getByText(line).first()).toBeVisible();
    await expect(page.getByText(skips).first()).toBeVisible();
    await expect(page.getByText('Contribution progress: ₹1,000 of ₹5,500 planned')).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByText(line)).toBeVisible();
    await expect(page.getByText(skips)).toBeVisible();
    await expect(page.getByText('of ₹5,500 planned')).toBeVisible();
    await expect(page.getByText('of 13')).toHaveCount(0);

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText(`Home down payment: ${line}.`)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/orders');
    await expect(page.getByText('Scheduled skip', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Scheduled skip (paused)')).toHaveCount(2);
  });

  test('resume early: the next payable date, with no new SIP', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await pause(page, 3);
    await page.reload();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await expect(page.getByText('If you resume now, the next instalment is on 5 Dec 2026.')).toBeVisible();
    await page.getByRole('button', { name: 'Resume now' }).click();
    await expect(page.getByText('Resumed. The next instalment is on 5 Dec 2026.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText('Next instalment: 5 Dec 2026')).toBeVisible();
    await page.goto('/sips');
    await expect(page.getByText('1 SIP · Demo orders')).toBeVisible();
  });

  test('stop: units stay, and the page says how to start again', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    const before = await page.getByText('Value today').locator('..').innerText();
    await page.goto(`/sips/${id}/stop`);
    await page.getByRole('button', { name: 'Stop anyway' }).click();
    await expect(page.getByText('Done. Your SIP is stopped.')).toBeVisible();
    await expect(page.getByText('Your units stay invested until you redeem them.').first()).toBeVisible();
    await expect(page.getByText("A stopped SIP can't be restarted")).toBeVisible();
    await expect(page.getByText("they aren't sold")).toBeVisible();
    expect(await page.getByText('Value today').locator('..').innerText()).toBe(before);
    await expect(page.getByRole('button', { name: 'Skip next' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Start a new SIP in this fund' }).click();
    await expect(page.getByLabel('SIP amount')).toBeVisible();
  });
});

test.describe('Goals', () => {
  test('edits keep what was saved, and survive logout and login', async ({ page }) => {
    const { username, pin } = await signUp(page);
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2031-03', target: 500_000 });

    await page.goto(`/sips/${id}/goal`);
    // The saved values are filled in, the target included.
    await expect(page.getByRole('button', { name: 'Home down payment' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Target amount')).toHaveValue('5,00,000');
    await expect(page.getByLabel('Month')).toHaveValue('03');
    await expect(page.getByLabel('Year')).toHaveValue('2031');

    await page.getByLabel('Year').selectOption('2032');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('Goal saved.')).toBeVisible();

    const header = /by Mar 2032 · \d+ instalments to go · target ₹5,00,000/;
    await expect(page.getByText(header)).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('by Mar 2032', { exact: true })).toBeVisible();
    await expect(page.getByText(/% of your ₹5,00,000 target/)).toBeVisible();

    await page.request.post('/api/auth/logout');
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/dashboard/);
    expect((await page.request.post('/api/auth/login', { data: { username, pin } })).ok()).toBe(true);
    await page.goto(`/sips/${id}`);
    await expect(page.getByText(header)).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('by Mar 2032', { exact: true })).toBeVisible();
  });

  test('a past month says why Save is off, and a bad target clears when fixed', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2031-03' });
    await page.goto(`/sips/${id}/goal`);
    const save = page.getByRole('button', { name: 'Save goal' });
    await page.getByLabel('Month').selectOption({ label: 'Oct' });
    await page.getByLabel('Year').selectOption('2026');
    await expect(page.getByText('Pick a month after this month.')).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel('Year').selectOption('2030');
    await expect(page.getByText('Pick a month after this month.')).toHaveCount(0);
    await expect(save).toBeEnabled();

    await page.getByLabel('Target amount').fill('5');
    await expect(page.getByText(/Enter a target from/)).toBeVisible();
    await expect(save).toBeDisabled();
    await page.getByLabel('Target amount').fill('50000');
    await expect(page.getByText(/Enter a target from/)).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test('a goal can be added to a SIP with none, and removed', async ({ page }) => {
    const id = await startSipNoGoal(page, { amount: 1000, day: 5 });
    await page.goto(`/sips/${id}/goal`);
    await expect(page.getByRole('heading', { name: 'Add a goal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save goal' })).toBeDisabled();
    await page.getByRole('button', { name: 'Wedding' }).click();
    await page.getByLabel('Month').selectOption({ label: 'Jun' });
    await page.getByLabel('Year').selectOption('2028');
    await page.getByRole('button', { name: 'Save goal' }).click();
    await expect(page.getByText('This SIP is for Wedding · by Jun 2028')).toBeVisible();
    await page.goto(`/sips/${id}/goal`);
    await page.getByRole('button', { name: 'Remove goal' }).click();
    await expect(page.getByText('Goal removed. You can add one any time.')).toBeVisible();
    await expect(page.getByText('No goal yet')).toBeVisible();
  });

  test('the goal step explains a past month too', async ({ page }) => {
    await openFund(page, { amount: 1000, day: 5 });
    await page.getByRole('button', { name: 'Start SIP' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Retirement' }).click();
    await dialog.getByLabel('Month').selectOption({ label: 'Nov' });
    await dialog.getByLabel('Year').selectOption('2026');
    await expect(dialog.getByText('Pick a month after this month.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save goal & start SIP' })).toBeDisabled();
  });
});

test.describe('Dates', () => {
  // The 29th, 30th and 31st, in a short month and a leap year. The SIP date stops at the 28th, so the first due date
  // falls in the next month, and a month-end today must never lose or double a date.
  for (const { today, day, first, next, goal, count } of [
    { today: '2027-01-29', day: 28, first: '28 Feb 2027', next: '28 Mar 2027', goal: '2027-06', count: 5 },
    { today: '2027-01-30', day: 28, first: '28 Feb 2027', next: '28 Mar 2027', goal: '2027-06', count: 5 },
    { today: '2027-01-31', day: 28, first: '28 Feb 2027', next: '28 Mar 2027', goal: '2027-06', count: 5 },
    { today: '2028-01-31', day: 15, first: '15 Feb 2028', next: '15 Mar 2028', goal: '2028-06', count: 5 },
    { today: '2028-02-29', day: 28, first: '28 Mar 2028', next: '28 Apr 2028', goal: '2028-08', count: 6 },
    { today: '2027-03-31', day: 1, first: '1 Apr 2027', next: '1 May 2027', goal: '2027-09', count: 6 },
  ]) {
    test(`a SIP started on ${today}, on the ${day}th`, async ({ page, request }) => {
      await setClock(request, today);
      await startClean(page);
      await startSipWithGoal(page, { amount: 1000, day, month: goal });
      await expect(page.getByText(`Next instalment: ${next}`)).toBeVisible();
      await expect(page.getByText(`1 of ${count} instalments paid · ${count - 1} instalments to go`).first()).toBeVisible();
      await expect(page.getByText(`for the ${first} date`)).toHaveCount(0); // That line is on the started page only.
      await page.goto('/orders');
      await expect(page.getByText('₹1,000').first()).toBeVisible();
    });
  }

  test('the due-date boundary: due today is still ahead, and the day after it has passed', async ({ page, request }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 10, month: '2027-11' });
    await expect(page.getByText('Next instalment: 10 Dec 2026')).toBeVisible();
    await skipNext(page);
    await expect(page.getByText('0 past skips · 1 scheduled skip').first()).toBeVisible();

    await setClock(request, '2026-12-10');
    await page.goto(`/sips/${id}`);
    await expect(page.getByText('0 past skips · 1 scheduled skip').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    await setClock(request, '2026-12-11');
    await page.goto(`/sips/${id}`);
    await expect(page.getByText('1 past skip · 0 scheduled skips').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(page.getByText('Next instalment: 10 Jan 2027')).toBeVisible();
  });

  test('a due date that passes unpaid shows as not collected, and nothing says it was paid', async ({ page, request }) => {
    await startSipWithGoal(page, { amount: 1000, day: 10, month: '2027-11' });
    await setClock(request, '2027-01-11');
    await page.goto('/orders');
    await expect(page.getByText('Not collected', { exact: true })).toHaveCount(2);
    await expect(page.getByText(/the demo doesn't collect instalments on its own/)).toBeVisible();
  });

  test('the price date and the activity date are told apart', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await expect(page.getByText('Fund prices as of 27 Oct 2026 · demo price series')).toBeVisible();
    await expect(page.getByText('Last payment 5 Nov 2026')).toBeVisible();
    await expect(page.getByText('Demo date: 5 Nov 2026')).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByText(/Demo date: 5 Nov 2026 · Fund prices as of 27 Oct 2026 · demo price series · Last payment 5 Nov 2026/)).toBeVisible();
  });
});

test.describe('Records', () => {
  test('the "Instalment paid" notification opens that instalment, and read stays read', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await page.goto('/dashboard');
    const bell = page.getByRole('button', { name: /Notifications/ });
    await expect(bell).toHaveAccessibleName(/unread/);
    await bell.click();
    await page.getByRole('link', { name: /Instalment paid/ }).click();

    await expect(page).toHaveURL(/\/orders\?instalment=\d+#instalment-\d+/);
    await expect(page.getByRole('heading', { name: 'All orders' })).toBeVisible();
    const row = page.locator('li[aria-current="true"]');
    await expect(row).toContainText('₹1,000');
    await expect(row).toContainText('Paid');

    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
    await page.goto('/sips');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  });

  test('the account menu has no Reports, and Orders is one tab away', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('link', { name: 'All orders' })).toBeVisible();
    await expect(page.getByText(/Reports/)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Orders' }).click();
    await expect(page.getByRole('heading', { name: 'All orders' })).toBeVisible();
  });
});

test.describe('Calculators', () => {
  test('the fund page never uses the past return, and starts with no rate', async ({ page }) => {
    await page.goto('/fund/1');
    const calculator = page.getByRole('region', { name: 'Return calculator' });
    await expect(calculator.getByText('Your rate: pick one')).toBeVisible();
    await expect(calculator.getByText('0% a year', { exact: true })).toBeVisible();
    await expect(calculator.getByText('-5% a year, a downside')).toBeVisible();
    await expect(calculator.getByText("Past returns don't predict future returns", { exact: false })).toBeVisible();
    await expect(calculator.getByText(/3Y return of/)).toHaveCount(0);
    await calculator.getByRole('button', { name: '8%', exact: true }).click();
    await expect(calculator.getByText('8% a year, your rate')).toBeVisible();
    await calculator.getByLabel('Or enter your own rate, in percent').fill('-3');
    await expect(calculator.getByText('-3% a year, your rate')).toBeVisible();
  });

  test('SIP calculator: assumptions, 0% and a downside, and "Start this SIP" carries the amount', async ({ page }) => {
    await page.goto('/calculators/sip');
    await expect(page.getByText(/start of its month/)).toBeVisible();
    await expect(page.getByText(/compounds monthly/)).toBeVisible();
    await expect(page.getByText('0% a year', { exact: true })).toBeVisible();
    await expect(page.getByText('-5% a year, a downside')).toBeVisible();
    const amount = page.getByRole('textbox', { name: 'Monthly amount' });
    await amount.fill('7000');
    await amount.blur();
    await page.getByRole('link', { name: 'Start this SIP' }).click();
    await expect(page.getByRole('heading', { name: 'All mutual funds' })).toBeVisible();
    await expect(page.getByText('From your calculator: ₹7,000 a month')).toBeVisible();
    await page.goto('/fund/1');
    await expect(page.getByLabel('SIP amount')).toHaveValue('7000');
    await expect(page.getByText('Filled in from your calculator.')).toBeVisible();
  });

  test('typing over a calculator amount replaces it, with the keyboard too', async ({ page }) => {
    await page.goto('/calculators/sip');
    const amount = page.getByRole('textbox', { name: 'Monthly amount' });
    await amount.focus();
    await amount.selectText();
    await page.keyboard.type('7000');
    await page.keyboard.press('Tab');
    await expect(amount).toHaveValue('7,000');
  });

  test('Goal planner: "Start this SIP" carries the target and the date into the goal step', async ({ page }) => {
    await page.goto('/calculators/goal?target=500000&years=5');
    await expect(page.getByText(/below the target/)).toHaveCount(2); // 0% and the downside, not the rate it was worked out at.
    await expect(page.getByText('0% a year', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start this SIP' }).click();
    await page.goto('/fund/1');
    await page.getByRole('button', { name: 'Start SIP' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Target amount')).toHaveValue('5,00,000');
    await expect(dialog.getByLabel('Year')).toHaveValue('2031');
    await expect(dialog.getByLabel('Month')).toHaveValue('11');
  });

  test('/about says which controls differ from Groww today', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'Where this differs from Groww today' })).toBeVisible();
    await expect(page.getByText(/three skips in a row cancel a SIP/)).toBeVisible();
  });
});

test.describe('When the AI is unavailable', () => {
  test('Before you stop shows the facts, and every action still works', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await page.goto(`/sips/${id}/stop`);
    await page.getByRole('button', { name: 'Markets are down' }).click();
    await expect(page.getByText('Quality check: AI unavailable → showing facts only')).toBeVisible();
    await expect(page.getByText('Confidence')).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip next' }).click();
    await page.getByRole('button', { name: 'Yes, skip it' }).click();
    await expect(page.getByText('Done. Your next instalment is skipped.')).toBeVisible();
    await expect(page.getByText('0 past skips · 1 scheduled skip').first()).toBeVisible();
  });

  test('"Returns below expectations" asks first, with chips', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    await page.goto(`/sips/${id}/stop`);
    await page.getByRole('button', { name: 'Returns below expectations' }).click();
    await expect(page.getByRole('heading', { name: 'What did you expect, and by when?' })).toBeVisible();
    const go = page.getByRole('button', { name: 'Show my SIP’s facts' });
    await expect(go).toBeDisabled();
    await page.getByRole('button', { name: 'Growth every month' }).click();
    await page.getByRole('button', { name: 'Within a year' }).click();
    await go.click();
    await expect(page.getByText('Quality check: AI unavailable → showing facts only')).toBeVisible();
  });
});

test.describe('The SIP date calendar', () => {
  const day = (page: Page, n: number) => page.getByRole('button', { name: `Day ${n}`, exact: true });

  test('is a compact button until it is opened', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await expect(dateButton(page)).toHaveText(/Monthly on 5th/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(day(page, 14)).toHaveCount(0);
    await expect(page.getByText('First instalment: 5 Nov 2026 · Next instalment: 5 Dec 2026')).toBeVisible();
  });

  test('picking a day closes it, and updates the button and the next instalment', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await dateButton(page).click();
    await expect(day(page, 5)).toHaveAttribute('aria-pressed', 'true');
    await day(page, 15).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dateButton(page)).toHaveText(/Monthly on 15th/);
    await expect(page.getByText('First instalment: 5 Nov 2026 · Next instalment: 15 Dec 2026')).toBeVisible();
    // Earlier in the month than today: the first instalment covers next month's date.
    await pickDay(page, 3);
    await expect(dateButton(page)).toHaveText(/Monthly on 3rd/);
    await expect(page.getByText('First instalment: 5 Nov 2026 · Next instalment: 3 Jan 2027')).toBeVisible();

    await page.getByRole('button', { name: 'Start SIP' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByRole('heading', { name: 'SIP started' })).toBeVisible();
    await expect(page.getByText('3 Jan 2027')).toBeVisible();
  });

  test('says each day the right way', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    for (const [n, text] of [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd']] as const) {
      await pickDay(page, n);
      await expect(dateButton(page)).toHaveText(new RegExp(`Monthly on ${text}`));
    }
  });

  test('29, 30 and 31 can not be picked, and the note says why', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await dateButton(page).click();
    for (const n of [29, 30, 31]) await expect(page.getByRole('button', { name: `Day ${n}, not available` })).toBeDisabled();
    await expect(page.getByText('Not available, so every month has this date')).toBeVisible();
    await page.getByRole('button', { name: 'Day 30, not available' }).click({ force: true });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(dateButton(page)).toHaveText(/Monthly on 5th/);
  });

  test('Esc closes without changing the date, and puts focus back on the button', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await dateButton(page).click();
    await day(page, 5).press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dateButton(page)).toHaveText(/Monthly on 5th/);
    await expect(dateButton(page)).toBeFocused();
  });

  test('a click outside closes it without changing the date', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await dateButton(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.click(8, 200);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dateButton(page)).toHaveText(/Monthly on 5th/);
  });

  test('works from the keyboard alone', async ({ page }) => {
    await openFund(page, { amount: 1000 });
    await dateButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(day(page, 5)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(day(page, 6)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(day(page, 13)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(day(page, 12)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(day(page, 5)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    // Moving is not choosing: the button keeps its date until Enter.
    await expect(dateButton(page)).toHaveText(/Monthly on 5th/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dateButton(page)).toHaveText(/Monthly on 7th/);
    await expect(dateButton(page)).toBeFocused();

    await page.keyboard.press('Space');
    await expect(day(page, 7)).toBeFocused();
    await page.keyboard.press('End');
    await expect(day(page, 28)).toBeFocused();
    // Past the last day it wraps to the 1st, never onto a day that can't be picked.
    await page.keyboard.press('ArrowRight');
    await expect(day(page, 1)).toBeFocused();
  });

  test('opens as a popover on a wide screen and a bottom sheet on a narrow one', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Sizes itself below.');
    await openFund(page, { amount: 1000 });
    await dateButton(page).click();
    const popover = (await page.getByRole('dialog').boundingBox())!;
    const button = (await dateButton(page).boundingBox())!;
    expect(popover.width).toBeLessThan(400);
    expect(popover.y).toBeGreaterThanOrEqual(button.y + button.height - 1);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 375, height: 700 });
    await dateButton(page).click();
    const sheet = (await page.getByRole('dialog').boundingBox())!;
    expect(sheet.width).toBe(375);
    expect(sheet.y + sheet.height).toBe(700);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // Big enough for a thumb, and the last row is on screen.
    expect((await day(page, 14).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: 'Day 31, not available' })).toBeInViewport();
  });

  test('a February start shows the real next date', async ({ page, request }) => {
    await setClock(request, '2027-02-01');
    await startClean(page);
    await openFund(page, { amount: 1000, day: 1 });
    await expect(page.getByText('First instalment: 1 Feb 2027 · Next instalment: 1 Mar 2027')).toBeVisible();
  });
});

test.describe('The extras are gone', () => {
  const GONE = [/New fund offers/, /Compare funds/, /Import funds/, /File tax/, /Not in this demo/, /can.t be bought/, /cannot be bought/];

  test('from Explore, and everything that works stays', async ({ page }) => {
    await page.goto('/explore');
    for (const text of GONE) await expect(page.getByText(text)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Products and tools' })).toBeVisible();
    for (const name of ['SIP calculator', 'Goal planner', 'SWP calculator', 'My goals']) await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    const sections = page.getByRole('navigation', { name: 'Sections' });
    for (const name of ['Orders', 'Watchlist']) await expect(sections.getByRole('link', { name })).toBeVisible();
  });

  test('from the menus', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Account menu' }).click();
    for (const text of GONE) await expect(page.getByText(text)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Notifications/ }).click();
    for (const text of GONE) await expect(page.getByText(text)).toHaveCount(0);
  });

  for (const key of ['nfo', 'compare', 'import', 'tax', 'terminal', 'stock-sip', 'screener', 'events', 'options', 'margin', 'fo-learn', 'etfs', 'ipo', 'bonds']) {
    test(`/soon/${key} goes to Explore`, async ({ page }) => {
      await page.goto(`/soon/${key}`);
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.getByRole('heading', { name: /Funds A–Z/ })).toBeVisible();
    });
  }

  test('/reports goes to Explore, and Orders no longer promises it', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/\/explore$/);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'All orders' })).toBeVisible();
    await expect(page.getByText(/coming later/i)).toHaveCount(0);
  });

  test('Stocks and F&O stay, with nothing that leads to a page that has gone', async ({ page }) => {
    for (const [path, heading] of [['/stocks', 'Stocks (demo)'], ['/fo', 'Contracts (demo)']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.locator('a[href^="/soon"]')).toHaveCount(0);
      await expect(page.getByText(/Products & Tools/i)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Terminal' })).toHaveCount(0);
    }
  });
});

test.describe('The gap to the target', () => {
  const short = "Your planned instalments add up to ₹13,000 by Nov 2027. That's ₹37,000 short of your ₹50,000 target (instalments only, no returns included).";
  const covered = 'Your planned instalments add up to ₹13,000, which covers your ₹5,000 target (instalments only, no returns included).';

  test('goal setup: short, covered, live as things change, and hidden with no target', async ({ page }) => {
    await openFund(page, { amount: 1000, day: 5 });
    await page.getByRole('button', { name: 'Start SIP' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Retirement' }).click();
    await dialog.getByLabel('Month').selectOption({ label: 'Nov' });
    await dialog.getByLabel('Year').selectOption('2027');
    await expect(dialog.getByText(/about 13 instalments/)).toBeVisible();
    await expect(dialog.getByText(/planned instalments/)).toHaveCount(0);

    await dialog.getByLabel('Target amount').fill('50000');
    await expect(dialog.getByText(short)).toBeVisible();
    await expect(dialog.getByText('To reach ₹50,000 from instalments alone, the monthly amount would be about ₹3,847.')).toBeVisible();

    await dialog.getByLabel('Target amount').fill('5000');
    await expect(dialog.getByText(covered)).toBeVisible();

    await dialog.getByLabel('Year').selectOption('2028');
    await expect(dialog.getByText(/add up to ₹25,000, which covers your ₹5,000 target/)).toBeVisible();

    await dialog.getByLabel('Target amount').fill('');
    await expect(dialog.getByText(/planned instalments/)).toHaveCount(0);
    await expect(dialog.getByText(/you should|increase/i)).toHaveCount(0);
  });

  test('Edit goal: the same message, leaving out scheduled skips', async ({ page }) => {
    const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11', target: 50_000 });
    await page.goto(`/sips/${id}/goal`);
    await expect(page.getByText(short)).toBeVisible();
    await expect(page.getByText('To reach ₹50,000 from instalments alone, the monthly amount would be about ₹4,084.')).toBeVisible();

    await page.getByLabel('Target amount').fill('5000');
    await expect(page.getByText(covered)).toBeVisible();

    await page.goto(`/sips/${id}`);
    await skipNext(page);
    await page.goto(`/sips/${id}/goal`);
    await expect(page.getByText(/add up to ₹12,000 by Nov 2027/)).toBeVisible();

    await page.getByLabel('Target amount').fill('');
    await expect(page.getByText(/planned instalments/)).toHaveCount(0);
  });
});

test('editing the goal amount reaches every screen, survives login, and can be cleared', async ({ page }) => {
  const { username, pin } = await signUp(page);
  const id = await startSipWithGoal(page, { amount: 1000, day: 5, month: '2031-03', target: 500_000 });
  await page.goto(`/sips/${id}/goal`);
  await expect(page.getByLabel('Target amount')).toHaveValue('5,00,000');
  await page.getByLabel('Target amount').fill('800000');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('Goal saved.')).toBeVisible();
  await expect(page.getByText(/by Mar 2031 · \d+ instalments to go · target ₹8,00,000/)).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText(/of your ₹8,00,000 target/)).toBeVisible();

  await page.request.post('/api/auth/logout');
  expect((await page.request.post('/api/auth/login', { data: { username, pin } })).ok()).toBe(true);
  await page.goto('/dashboard');
  await expect(page.getByText(/of your ₹8,00,000 target/)).toBeVisible();
  await page.goto(`/sips/${id}`);
  await expect(page.getByText(/target ₹8,00,000/)).toBeVisible();

  await page.goto(`/sips/${id}/goal`);
  await expect(page.getByLabel('Target amount')).toHaveValue('8,00,000');
  await page.getByLabel('Target amount').fill('');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByText('Goal saved.')).toBeVisible();
  await expect(page.getByText(/target ₹/)).toHaveCount(0);
  await expect(page.getByText(/by Mar 2031 · \d+ instalments to go/)).toBeVisible();
});

test.describe('The demo control is gone', () => {
  test('from every screen, the menu and the API', async ({ page }) => {
    for (const path of ['/explore', '/dashboard']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: /Simulate/ })).toHaveCount(0);
      await expect(page.getByText(/demo control/i)).toHaveCount(0);
    }
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText(/market fall to see|Demo market fell|Try a market fall/)).toHaveCount(0);
    const response = await page.request.post('/api/demo/market-fall');
    expect(response.status()).toBe(404);
  });

  test("Riya's seeded dip is still there, and its explainer still works", async ({ page }) => {
    await startClean(page, 'riya');
    await page.goto('/dashboard');
    await expect(page.getByText(/simulated/i)).toHaveCount(0);
    await page.getByRole('link', { name: 'What does this dip mean for my goal?' }).first().click();
    await expect(page).toHaveURL(/explain=dip/);
    // No AI on this server, so the facts-only card: the feature itself still runs.
    await expect(page.getByText('Quality check: AI unavailable → showing facts only')).toBeVisible();
    await expect(page.getByText('Worst fall since you started:')).toBeVisible();
  });
});

test.describe('Text colour', () => {
  const black = 'rgb(0, 0, 0)';

  test('main text is black everywhere it was tinted', async ({ page }) => {
    await startSipWithGoal(page, { amount: 1000, day: 5, month: '2027-11' });
    const colour = (selector: string) => page.locator(selector).first().evaluate((e) => getComputedStyle(e).color);
    expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe(black);
    expect(await colour('h1')).toBe(black);
    expect(await colour('.text-muted')).toBe(black);
    expect(await colour('[role="note"]')).toBe(black);
    await expect(page.getByText(/This SIP is for/)).toHaveCSS('color', black);
    await page.goto('/dashboard');
    await expect(page.getByText('by Nov 2027', { exact: true })).toHaveCSS('color', black);
  });

  test('gains and losses keep their colour and arrows, buttons stay white, links stay marked', async ({ page }) => {
    await startClean(page, 'riya');
    await page.goto('/dashboard');
    const loss = page.getByText(/^▼/).first();
    await expect(loss).toBeVisible();
    await page.goto('/explore');
    const signed = page.locator('.text-gain, .text-loss').first();
    await expect(signed).not.toHaveCSS('color', black);
    await page.goto('/funds');
    await expect(page.getByRole('link', { name: '← Explore' })).toHaveCSS('text-decoration-line', 'underline');
    await page.goto('/fund/1');
    await expect(page.getByRole('button', { name: 'Start SIP' })).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('the active product tab is marked by more than colour', async ({ page }) => {
    await page.goto('/explore');
    const tab = page.getByRole('navigation', { name: 'Products' }).first().getByRole('link', { name: 'Mutual Funds' });
    await expect(tab).toHaveCSS('text-decoration-line', 'underline');
  });
});

test('/quality labels each score, with its prompt version', async ({ page }) => {
  await page.goto('/quality');
  await expect(page.getByText('Golden set: tuning set (rules were adjusted using it)')).toBeVisible();
  await expect(page.getByText('Holdout: fresh set')).toBeVisible();
  await expect(page.getByText('no longer fully fresh')).toBeVisible();
  await expect(page.getByText(/Prompt v\d+/).first()).toBeVisible();
});
