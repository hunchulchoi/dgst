import { expect, test } from '@playwright/test';
// import bcrypt from 'bcrypt';


test('index page renders successfully', async ({ page }) => {
  const response = await page.goto('/');
  test.skip(!response || response.status() >= 500, 'preview app requires backend env to render /');

  await expect(page).toHaveTitle(/자유게시판 - dgst\.me/);
  await expect(page.locator('main')).toBeVisible();
});

// test('bcrypt test', async ({ page }) => {
//   //await page.goto('/');
//   //await expect(page.getByRole('heading', { name: 'Welcome to SvelteKit' })).toBeVisible();
// 
//   for (let i = 0; i < 10; i++) {
//     console.log(bcrypt.hashSync('waitandpreparation@gmail.com', bcrypt.genSaltSync(12)));
//   }
// });
