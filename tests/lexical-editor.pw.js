import { expect, test } from '@playwright/test';

const editorSelector = '.lexical-editor__content[contenteditable="true"]';

/** @param {import('@playwright/test').Page} page */
async function gotoSmokeEditor(page) {
  const response = await page.goto('/__smoke/lexical-editor');
  expect(response?.status()).toBe(200);

  const editor = page.locator(editorSelector);
  await expect(editor).toBeVisible();
  await expect(page.locator('.lexical-toolbar')).toBeVisible();
  await expect(page.locator('.swal2-container')).toHaveCount(0);

  return editor;
}

/** @param {import('@playwright/test').Page} page @param {string} url */
async function mockUpload(page, url) {
  await page.route('**/board/upload', async (/** @type {import('@playwright/test').Route} */ route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url })
    });
  });
}

/** @param {import('@playwright/test').Page} page */
async function mockOG(page) {
  await page.route('**/api/og', async (/** @type {import('@playwright/test').Route} */ route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Smoke OG Title',
        description: 'Smoke OG Description',
        siteName: 'Smoke Site',
        image: '/og/smoke.png'
      })
    });
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; mimeType: string; bytes: number[] }} file
 */
async function pasteFile(page, { name, mimeType, bytes }) {
  await page.locator(editorSelector).click();
  await page.evaluate(
    (
      /** @type {{ selector: string; name: string; mimeType: string; bytes: number[] }} */ {
        selector,
        name,
        mimeType,
        bytes
      }
    ) => {
      const editor = document.querySelector(selector);
      if (!editor) throw new Error('Smoke editor not found');

      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }));
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data
        })
      );
    },
    { selector: editorSelector, name, mimeType, bytes }
  );
}

/** @param {import('@playwright/test').Page} page @param {string} text */
async function pasteText(page, text) {
  await page.locator(editorSelector).click();
  await page.evaluate(
    (/** @type {{ selector: string; text: string }} */ { selector, text }) => {
      const editor = document.querySelector(selector);
      if (!editor) throw new Error('Smoke editor not found');

      const data = new DataTransfer();
      data.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data
        })
      );
    },
    { selector: editorSelector, text }
  );
}

test('Lexical editor smoke route mounts and syncs typed content', async ({ page }) => {
  const editor = await gotoSmokeEditor(page);

  await editor.click();
  await page.keyboard.type('hello lexical smoke');

  await expect(editor).toContainText('hello lexical smoke');
  await expect(page.locator('[data-testid="editor-html"]')).toContainText('hello lexical smoke');
});

test('Lexical editor uploads selected images and inserts image html', async ({ page }) => {
  await mockUpload(page, '/uploads/smoke-selected-image.png');
  await gotoSmokeEditor(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'selected-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  });

  const html = page.locator('[data-testid="editor-html"]');
  await expect(html).toContainText('<img');
  await expect(html).toContainText('/uploads/smoke-selected-image.png');
  await expect(page.locator('[data-testid="editor-uploads"]')).toHaveText('0');
});

test('Lexical editor uploads pasted images and inserts image html', async ({ page }) => {
  await mockUpload(page, '/uploads/smoke-pasted-image.png');
  await gotoSmokeEditor(page);

  await pasteFile(page, {
    name: 'pasted-image.png',
    mimeType: 'image/png',
    bytes: [137, 80, 78, 71, 13, 10, 26, 10]
  });

  const html = page.locator('[data-testid="editor-html"]');
  await expect(html).toContainText('<img');
  await expect(html).toContainText('/uploads/smoke-pasted-image.png');
  await expect(page.locator('[data-testid="editor-uploads"]')).toHaveText('0');
});

test('Lexical editor uploads selected videos and inserts video html', async ({ page }) => {
  await mockUpload(page, '/uploads/smoke-video.mp4');
  await gotoSmokeEditor(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'smoke-video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('smoke video')
  });

  const html = page.locator('[data-testid="editor-html"]');
  await expect(html).toContainText('<video');
  await expect(html).toContainText('/uploads/smoke-video.mp4');
  await expect(page.locator('[data-testid="editor-uploads"]')).toHaveText('0');
});

test('Lexical editor creates OG cards from pasted URLs', async ({ page }) => {
  await mockOG(page);
  await gotoSmokeEditor(page);

  await pasteText(page, 'https://example.com/smoke-og');

  const html = page.locator('[data-testid="editor-html"]');
  await expect(html).toContainText('Smoke OG Title');
  await expect(html).toContainText('Smoke OG Description');
  await expect(html).toContainText('Smoke Site');
  await expect(html).toContainText('/og/smoke.png');
  await expect(html).toContainText('https://example.com/smoke-og');
  await expect(page.locator('[data-testid="editor-title"]')).toHaveText('Smoke OG Title');
});
