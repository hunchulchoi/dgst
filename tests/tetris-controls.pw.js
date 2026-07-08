import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'dgst_tetris_state';

async function clearTetrisSave(page) {
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

/** 일시정지 오버레이 */
const pauseOverlay = (page) => page.locator('.tetris-overlay-title', { hasText: '일시정지' });

/** 터치 드래그로 좌우 이동 시뮬레이션 */
async function dragHorizontal(page, selector, deltaPx) {
  await page.locator(selector).evaluate((el, delta) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const endX = cx + delta;
    const makeTouch = (x) =>
      new Touch({
        identifier: 0,
        target: el,
        clientX: x,
        clientY: cy,
        pageX: x,
        pageY: cy,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1
      });
    const start = makeTouch(cx);
    const end = makeTouch(endX);
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [start],
        targetTouches: [start],
        changedTouches: [start]
      })
    );
    el.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [end],
        targetTouches: [end],
        changedTouches: [end]
      })
    );
    el.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [end]
      })
    );
  }, deltaPx);
}

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

  test('touch drag moves active piece', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();

    const before = await getFilledCellPositions(page);
    await dragHorizontal(page, '.tetris-board-wrap', 40);
    await page.waitForTimeout(120);

    const after = await getFilledCellPositions(page);
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toEqual(before);
  });

  test('touch drag works after autosave pause restore', async ({ page }) => {
    await page.getByRole('button', { name: '시작' }).click();
    await expect(page.locator('.tetris-cell-filled:not(.tetris-cell-ghost)').first()).toBeVisible();

    await page.getByRole('button', { name: '⏸' }).click();
    await expect(pauseOverlay(page)).toBeVisible();

    const before = await getFilledCellPositions(page);
    await dragHorizontal(page, '.tetris-drag-zone', -40);
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
