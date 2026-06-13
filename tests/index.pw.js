import { expect, test } from '@playwright/test';
// import bcrypt from 'bcrypt';

test('index page renders successfully', async ({ page }) => {
  const response = await page.goto('/');
  test.skip(!response || response.status() >= 500, 'preview app requires backend env to render /');

  await expect(page).toHaveTitle(/자유게시판 - dgst\.me/);
  await expect(page.locator('main')).toBeVisible();
});

test('board layout width follows mobile viewport rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/');
  test.skip(!response || response.status() >= 500, 'preview app requires backend env to render /');

  await expect(page.locator('.board-chrome-connect')).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('.app-shell')?.getBoundingClientRect().width ?? 0)
    )
    .toBeLessThanOrEqual(391);

  await page.waitForTimeout(450);
  await page.setViewportSize({ width: 667, height: 390 });

  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('.app-shell')?.getBoundingClientRect().width ?? 0)
    )
    .toBeGreaterThan(640);

  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    appShellWidth: document.querySelector('.app-shell')?.getBoundingClientRect().width ?? 0,
    documentScrollWidth: document.documentElement.scrollWidth
  }));

  expect(metrics.appShellWidth).toBeGreaterThan(640);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

// test('bcrypt test', async ({ page }) => {
//   //await page.goto('/');
//   //await expect(page.getByRole('heading', { name: 'Welcome to SvelteKit' })).toBeVisible();
//
//   for (let i = 0; i < 10; i++) {
//     console.log(bcrypt.hashSync('waitandpreparation@gmail.com', bcrypt.genSaltSync(12)));
//   }
// });
