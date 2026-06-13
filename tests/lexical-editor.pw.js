import { expect, test } from '@playwright/test';

test('Lexical editor smoke route mounts and syncs typed content', async ({ page }) => {
  const response = await page.goto('/__smoke/lexical-editor');
  expect(response?.status()).toBe(200);

  const editor = page.locator('.lexical-editor__content[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await expect(page.locator('.lexical-toolbar')).toBeVisible();
  await expect(page.locator('.swal2-container')).toHaveCount(0);

  await editor.click();
  await page.keyboard.type('hello lexical smoke');

  await expect(editor).toContainText('hello lexical smoke');
  await expect(page.locator('[data-testid="editor-html"]')).toContainText('hello lexical smoke');
});
