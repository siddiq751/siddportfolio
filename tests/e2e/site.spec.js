import { expect, test } from '@playwright/test';

const isMobile = (testInfo) => testInfo.project.name === 'mobile';

/** Fail the test on any console error or uncaught exception. */
function watchConsole(page) {
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

test.beforeEach(async ({ page }) => {
  // Skip the once-per-session intro unless a test opts back in.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('test:intro')) sessionStorage.setItem('dimension:intro', '1');
    } catch {
      /* about:blank */
    }
  });
});

test('home renders the identity, all stations and no errors', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Siddiq \| Freelance Web Developer/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Siddiq');
  for (const id of ['home', 'origin', 'instruments', 'works', 'contact']) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await page.waitForTimeout(1500);
  expect(problems).toEqual([]);
});

test('no horizontal overflow at any width', async ({ page }) => {
  for (const width of [320, 375, 425, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test('the Index opens with the keyboard, filters and navigates', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Index' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Search the site')).toBeFocused();
  await page.keyboard.type('restaurant');
  await expect(dialog.getByRole('option', { name: /Restaurant Website/ })).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Coaching/ })).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/work\/restaurant\/$/);
  await expect(page.getByText('Concept study').first()).toBeVisible();
});

test('Escape closes the Index and returns focus', async ({ page }) => {
  await page.goto('/');
  const opener = page.locator('.topbar__index');
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Index' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Index' })).toBeHidden();
  await expect(opener).toBeFocused();
});

test('station navigation reaches every section', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'The rail is a desktop control; mobile uses the Index.');
  await page.goto('/');
  for (const id of ['origin', 'instruments', 'works', 'contact']) {
    await page.locator(`.rail a[href="/#${id}"]`).click();
    await expect(page.locator(`.rail a[href="/#${id}"]`)).toHaveAttribute('aria-current', 'true', { timeout: 6000 });
  }
});

test('the Works gallery steps through studies', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'Gallery mode is for wide screens; mobile shows a list.');
  await page.goto('/#works');
  await page.locator('[data-work-step="2"]').click();
  await expect(page.locator('[data-work="2"]')).toHaveClass(/is-active/, { timeout: 6000 });
  await expect(page.locator('[data-work-step="2"]')).toHaveAttribute('aria-current', 'true');
});

test('case studies are honest and lead back', async ({ page }) => {
  await page.goto('/work/coaching/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coaching Institute Website');
  await expect(page.getByText(/not client work/)).toBeVisible();
  await expect(page.getByText('Intended stack')).toBeVisible();
  await page.getByRole('link', { name: /Start a similar project/ }).click();
  await expect(page).toHaveURL(/type=Business%20Website#contact$/);
  await expect(page.locator('#f-type')).toHaveValue('Business Website');
});

test('the contact form validates and hands off to email', async ({ page }) => {
  await page.goto('/#contact');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#f-name')).toBeFocused();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(4);

  await page.fill('#f-name', 'Asha Rao');
  await page.fill('#f-email', 'asha@example.com');
  await page.selectOption('#f-type', 'Landing Page');
  await page.fill('#f-message', 'A landing page for a product launch.');
  await page.route('mailto:*', (route) => route.abort());
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('status')).toContainText('Almost there.');
  await page.getByRole('button', { name: 'Send another message' }).click();
  await expect(page.locator('#f-name')).toHaveValue('');
});

test('direct contact links are correct', async ({ page }) => {
  await page.goto('/');
  const whatsapp = page.locator('a[href^="https://wa.me/"]').first();
  await expect(whatsapp).toHaveAttribute('href', 'https://wa.me/917416715011');
  await expect(whatsapp).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('a[href^="mailto:siddiqmd751@gmail.com"]').first()).toBeAttached();
});

test('the 3D world can be switched off and stays off', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByRole('switch', { name: /3D world/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-world', 'off');
  await expect(page.locator('[data-world] canvas')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-world', 'off');
  await expect(page.locator('.world__still')).toBeVisible();
});

test('reduced motion skips the intro and camera travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => sessionStorage.setItem('test:intro', '1'));
  await page.addInitScript(() => sessionStorage.removeItem('dimension:intro'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-intro', 'none');
  await expect(page.getByRole('button', { name: 'Skip intro' })).toHaveCount(0);
});

test('first visit offers a skip-intro control', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('test:intro', '1'));
  await page.addInitScript(() => sessionStorage.removeItem('dimension:intro'));
  await page.goto('/');
  const skip = page.getByRole('button', { name: 'Skip intro' });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toHaveCount(0);
});

test('unknown pages show the 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lost in the dimension.');
});
