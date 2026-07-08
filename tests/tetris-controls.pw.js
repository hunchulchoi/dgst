import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'dgst_tetris_state';

async function clearTetrisSave(page) {
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

/** 일시정지 오버레이 */
const pauseOverlay = (page) => page.locator('.tetris-overlay-title', { hasText: '일시정지' });

/** 보드에 채워진 셀 좌표 목록 */
async function getFilledCellPositions(page) {
  return page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.tetris-cell-filled'));
    return cells.map((cell) => {
      const row = cell.parentElement;
      const board = row?.parentElement;
      const rowIndex = row ? Array.from(board?.children ?? []).indexOf(row) : -1;
      const colIndex = row ? Array.from(row.children).indexOf(cell) : -1;
      return { row: rowIndex, col: colIndex };
    });
  });
}

test.describe('tetris smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/games/tetris');
    await clearTetrisSave(page);
    await page.reload();
  });

  test('start button begins playable game', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.getByRole('heading', { name: /Stage 1/ })).toBeVisible();
    await expect(pauseOverlay(page)).not.toBeVisible();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();
  });

  test('control buttons move active piece', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();

    const before = await getFilledCellPositions(page);
    await page.getByRole('button', { name: '오른쪽' }).click();
    await page.waitForTimeout(120);

    const after = await getFilledCellPositions(page);
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
  });

  test('control buttons work after autosave pause restore', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();

    await page.getByRole('button', { name: '⏸' }).click();
    await expect(pauseOverlay(page)).toBeVisible();

    const before = await getFilledCellPositions(page);
    await page.getByRole('button', { name: '왼쪽' }).click();
    await page.waitForTimeout(120);

    await expect(pauseOverlay(page)).not.toBeVisible();
    const after = await getFilledCellPositions(page);
    expect(after).not.toEqual(before);
  });

  test('keyboard moves piece after autosave restore', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();

    await page.waitForFunction(
      (key) => localStorage.getItem(key)?.includes('"screen":"playing"'),
      STORAGE_KEY
    );
    await page.reload();
    await expect(pauseOverlay(page)).toBeVisible();

    const before = await getFilledCellPositions(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);

    await expect(pauseOverlay(page)).not.toBeVisible();
    const after = await getFilledCellPositions(page);
    expect(after).not.toEqual(before);
  });
});
