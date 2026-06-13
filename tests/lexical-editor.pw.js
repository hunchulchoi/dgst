import { expect, test } from '@playwright/test';

const editorSelector = '.lexical-editor__content[contenteditable="true"]';

/** @param {import('@playwright/test').Page} page @param {{ initialHtml?: string }} [options] */
async function gotoSmokeEditor(page, options = {}) {
  const path = options.initialHtml
    ? `/__smoke/lexical-editor?initialHtml=${encodeURIComponent(options.initialHtml)}`
    : '/__smoke/lexical-editor';
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);

  const editor = page.locator(editorSelector);
  await expect(editor).toBeVisible();
  await expect(page.locator('.lexical-toolbar')).toBeVisible();
  await expect(page.locator('.swal2-container')).toHaveCount(0);

  return editor;
}

/** @param {import('@playwright/test').Page} page @param {string[]} snippets */
async function expectSyncedEditorHtmlToContain(page, snippets) {
  const html = page.locator('[data-testid="editor-html"]');
  for (const snippet of snippets) {
    await expect(html).toContainText(snippet);
  }
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

test('Lexical editor renders Enter-created paragraphs with normal line spacing', async ({ page }) => {
  const editor = await gotoSmokeEditor(page);

  await editor.click();
  await page.keyboard.type('first line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line');

  const paragraphGap = await page.locator(editorSelector).evaluate((root) => {
    const paragraphs = Array.from(root.querySelectorAll('p'));
    if (paragraphs.length < 2) throw new Error('Expected at least two paragraphs');

    const firstRect = paragraphs[0].getBoundingClientRect();
    const secondRect = paragraphs[1].getBoundingClientRect();
    return secondRect.top - firstRect.bottom;
  });

  expect(paragraphGap).toBeLessThanOrEqual(2);
});

test('Lexical editor mobile toolbar wraps and media buttons show icons only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoSmokeEditor(page);

  await expect(page.getByRole('button', { name: '이미지 업로드' })).toHaveText('🏞️');
  await expect(page.getByRole('button', { name: '동영상 업로드' })).toHaveText('🎞️');
  await expect(page.locator('.lexical-toolbar')).toHaveCSS('flex-wrap', 'wrap');
});

test('Lexical editor uploads selected images and inserts image html', async ({ page }) => {
  await mockUpload(page, '/uploads/smoke-selected-image.png');
  await gotoSmokeEditor(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'selected-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  });

  await expectSyncedEditorHtmlToContain(page, ['<img', '/uploads/smoke-selected-image.png']);
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

  await expectSyncedEditorHtmlToContain(page, ['<img', '/uploads/smoke-pasted-image.png']);
  await expect(page.locator('[data-testid="editor-uploads"]')).toHaveText('0');
});

test('Lexical editor preserves initial image html when syncing loaded content', async ({ page }) => {
  const initialHtml = [
    '<p>before image</p>',
    '<img src="/uploads/existing-image.png" alt="existing" style="max-width: 100%; height: auto; display: block; margin: 1em 0;">',
    '<p>after image</p>'
  ].join('');

  const editor = await gotoSmokeEditor(page, { initialHtml });

  await expect(editor.locator('img[src="/uploads/existing-image.png"]')).toHaveCount(1);
  await expectSyncedEditorHtmlToContain(page, [
    'before image',
    '<img',
    '/uploads/existing-image.png',
    'after image'
  ]);
});

test('Lexical editor uploads selected videos and inserts video html', async ({ page }) => {
  await mockUpload(page, '/uploads/smoke-video.mp4');
  await gotoSmokeEditor(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'smoke-video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('smoke video')
  });

  await expectSyncedEditorHtmlToContain(page, ['<video', '/uploads/smoke-video.mp4']);
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
