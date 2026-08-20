import { expect, test } from '@playwright/test';

const KAKAO_ANDROID_16_UA =
  'Mozilla/5.0 (Linux; Android 16; SM-A366N Build/BP2A.250605.031; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/150.0.0.0 Mobile Safari/537.36 KAKAOTALK/26.7.1 (INAPP)';

test.use({
  userAgent: KAKAO_ANDROID_16_UA,
  viewport: { width: 384, height: 748 }
});

test('KakaoTalk WebView renders and navigates back home without a page error', async ({ page }) => {
  /** @type {string[]} */
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('dgst:kakao-external-browser-prompt:v1', '1');
  });

  const response = await page.goto('/');
  test.skip(!response || response.status() >= 500, 'preview app requires backend env to render /');

  expect(response?.status()).toBe(200);
  await expect(page.locator('main')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth
    }))
  ).toMatchObject({ viewportWidth: 384, documentWidth: 384 });

  await page.getByRole('link', { name: '개인정보처리방침' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole('link', { name: 'dgst × 리센느 로고' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main.board-chrome-connect')).toBeVisible();
  await expect(page.locator('main.privacy-policy')).toHaveCount(0);
  await expect(page.getByText('Ooooops!-500')).toHaveCount(0);

  expect(runtimeErrors).toEqual([]);
});
