import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ hasTouch: true, isMobile: true });

test('minesweeper board scroll styles use overflow auto', () => {
  const source = readFileSync(
    new URL('../src/routes/games/minesweeper/+page.svelte', import.meta.url),
    'utf8'
  );
  const scrollBlocks = [...source.matchAll(/\.minesweeper-board-scroll\s*\{[^}]*\}/g)].map(
    ([block]) => block
  );

  expect(scrollBlocks.length).toBeGreaterThan(0);
  for (const block of scrollBlocks) {
    expect(block).toMatch(/\boverflow:\s*auto;/);
    expect(block).not.toMatch(/\boverflow(?:-[xy])?:\s*visible;/);
  }
});

test('expert minesweeper board can be reached horizontally on mobile portrait', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games/minesweeper');

  await page.getByRole('button', { name: '알겠어요! 게임 시작하기' }).click();
  await page.getByRole('button', { name: /고급/ }).first().click();

  const board = page.locator('.minesweeper-board');
  await expect(board).toBeVisible();

  const metrics = await page.evaluate(() => {
    const boardEl = document.querySelector('.minesweeper-board');
    const gameRoot = document.querySelector('.minesweeper-game-root');
    const boardScroll = document.querySelector('.minesweeper-board-scroll');
    const rankCol = document.querySelector('.minesweeper-rank-col');

    if (!boardEl || !gameRoot || !boardScroll || !rankCol) {
      throw new Error('Expected minesweeper layout elements to be present');
    }

    const boardRect = boardEl.getBoundingClientRect();
    const scrollRect = boardScroll.getBoundingClientRect();
    const scrollStyle = getComputedStyle(boardScroll);
    const rankRect = rankCol.getBoundingClientRect();

    boardScroll.scrollLeft = boardScroll.scrollWidth;

    return {
      boardWidth: boardRect.width,
      boardBottom: boardRect.bottom,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollFrameWidth: scrollRect.width,
      scrollFrameOverflowX: scrollStyle.overflowX,
      scrollFrameOverflowY: scrollStyle.overflowY,
      scrollFrameScrollWidth: boardScroll.scrollWidth,
      maxScrollLeft: boardScroll.scrollLeft,
      rankTop: rankRect.top,
      rootWidth: gameRoot.getBoundingClientRect().width
    };
  });

  expect(metrics.boardWidth).toBeGreaterThan(metrics.viewportWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollFrameWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollFrameOverflowX).toBe('auto');
  expect(metrics.scrollFrameOverflowY).toBe('auto');
  expect(metrics.scrollFrameScrollWidth).toBeGreaterThanOrEqual(metrics.boardWidth);
  expect(metrics.maxScrollLeft).toBeGreaterThan(metrics.boardWidth - metrics.viewportWidth - 24);
  expect(metrics.rankTop).toBeGreaterThanOrEqual(metrics.boardBottom);
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  await page.evaluate(() => {
    const boardScroll = document.querySelector('.minesweeper-board-scroll');
    if (boardScroll) boardScroll.scrollLeft = 0;
  });

  const scrollBox = await page.locator('.minesweeper-board-scroll').boundingBox();
  if (!scrollBox) throw new Error('Expected minesweeper scroll box to have a bounding box');

  const client = await page.context().newCDPSession(page);
  const y = scrollBox.y + Math.min(180, scrollBox.height / 2);
  const startX = scrollBox.x + scrollBox.width - 24;
  const endX = scrollBox.x + 48;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }]
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: endX, y }]
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('.minesweeper-board-scroll')?.scrollLeft ?? 0)
    )
    .toBeGreaterThan(100);
});

test('expert minesweeper rank stays below board and board scrolls on mobile landscape', async ({
  page
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/games/minesweeper');

  await page.getByRole('button', { name: '알겠어요! 게임 시작하기' }).click();
  await page.getByRole('button', { name: /고급/ }).first().click();

  const board = page.locator('.minesweeper-board');
  await expect(board).toBeVisible();

  const metrics = await page.evaluate(() => {
    const boardEl = document.querySelector('.minesweeper-board');
    const gameRoot = document.querySelector('.minesweeper-game-root');
    const boardScroll = document.querySelector('.minesweeper-board-scroll');
    const rankCol = document.querySelector('.minesweeper-rank-col');

    if (!boardEl || !gameRoot || !boardScroll || !rankCol) {
      throw new Error('Expected minesweeper layout elements to be present');
    }

    const boardRect = boardEl.getBoundingClientRect();
    const scrollRect = boardScroll.getBoundingClientRect();
    const scrollStyle = getComputedStyle(boardScroll);
    const rankRect = rankCol.getBoundingClientRect();

    boardScroll.scrollLeft = boardScroll.scrollWidth;

    return {
      boardWidth: boardRect.width,
      boardBottom: boardRect.bottom,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollFrameWidth: scrollRect.width,
      scrollFrameOverflowX: scrollStyle.overflowX,
      scrollFrameOverflowY: scrollStyle.overflowY,
      scrollFrameScrollWidth: boardScroll.scrollWidth,
      maxScrollLeft: boardScroll.scrollLeft,
      rankTop: rankRect.top,
      rootWidth: gameRoot.getBoundingClientRect().width
    };
  });

  expect(metrics.boardWidth).toBeGreaterThan(metrics.viewportWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollFrameWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollFrameOverflowX).toBe('auto');
  expect(metrics.scrollFrameOverflowY).toBe('auto');
  expect(metrics.scrollFrameScrollWidth).toBeGreaterThanOrEqual(metrics.boardWidth);
  expect(metrics.maxScrollLeft).toBeGreaterThan(metrics.boardWidth - metrics.viewportWidth - 24);
  expect(metrics.rankTop).toBeGreaterThanOrEqual(metrics.boardBottom);
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test('expert minesweeper rank stays right and board scrolls on iPad portrait', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/games/minesweeper');

  await page.getByRole('button', { name: '알겠어요! 게임 시작하기' }).click();
  await page.getByRole('button', { name: /고급/ }).first().click();

  const board = page.locator('.minesweeper-board');
  await expect(board).toBeVisible();

  const metrics = await page.evaluate(() => {
    const boardEl = document.querySelector('.minesweeper-board');
    const gameRoot = document.querySelector('.minesweeper-game-root');
    const boardScroll = document.querySelector('.minesweeper-board-scroll');
    const rankCol = document.querySelector('.minesweeper-rank-col');

    if (!boardEl || !gameRoot || !boardScroll || !rankCol) {
      throw new Error('Expected minesweeper layout elements to be present');
    }

    const boardRect = boardEl.getBoundingClientRect();
    const scrollRect = boardScroll.getBoundingClientRect();
    const scrollStyle = getComputedStyle(boardScroll);
    const rankRect = rankCol.getBoundingClientRect();

    boardScroll.scrollLeft = boardScroll.scrollWidth;

    return {
      boardWidth: boardRect.width,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollFrameWidth: scrollRect.width,
      scrollFrameOverflowX: scrollStyle.overflowX,
      scrollFrameOverflowY: scrollStyle.overflowY,
      scrollFrameScrollWidth: boardScroll.scrollWidth,
      maxScrollLeft: boardScroll.scrollLeft,
      rankLeft: rankRect.left,
      rankRight: rankRect.right,
      scrollRight: scrollRect.right,
      rootWidth: gameRoot.getBoundingClientRect().width
    };
  });

  expect(metrics.boardWidth).toBeGreaterThan(metrics.scrollFrameWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.scrollFrameWidth).toBeLessThan(metrics.viewportWidth);
  expect(metrics.scrollFrameOverflowX).toBe('auto');
  expect(metrics.scrollFrameOverflowY).toBe('auto');
  expect(metrics.scrollFrameScrollWidth).toBeGreaterThanOrEqual(metrics.boardWidth);
  expect(metrics.maxScrollLeft).toBeGreaterThan(metrics.boardWidth - metrics.scrollFrameWidth - 24);
  expect(metrics.rankLeft).toBeGreaterThanOrEqual(metrics.scrollRight);
  expect(metrics.rankRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test('mobile board width limit is restored after leaving minesweeper', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games/minesweeper');

  await page.getByRole('button', { name: '알겠어요! 게임 시작하기' }).click();
  await page.getByRole('button', { name: /고급/ }).first().click();
  await expect(page.locator('.minesweeper-board')).toBeVisible();

  await page.goto('/');
  await expect(page.locator('.board-chrome-connect')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const appShell = document.querySelector('.app-shell');
    const pageTransition = document.querySelector('.page-transition');

    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      htmlHasMinesweeperClass:
        document.documentElement.classList.contains('minesweeper-page-scroll'),
      bodyHasMinesweeperClass: document.body.classList.contains('minesweeper-page-scroll'),
      appShellHasMinesweeperClass: appShell?.classList.contains('minesweeper-page-scroll') ?? false,
      pageTransitionHasMinesweeperClass:
        pageTransition?.classList.contains('minesweeper-page-scroll') ?? false,
      appShellMaxWidth: appShell ? getComputedStyle(appShell).maxWidth : null,
      pageTransitionMaxWidth: pageTransition ? getComputedStyle(pageTransition).maxWidth : null
    };
  });

  expect(metrics.htmlHasMinesweeperClass).toBe(false);
  expect(metrics.bodyHasMinesweeperClass).toBe(false);
  expect(metrics.appShellHasMinesweeperClass).toBe(false);
  expect(metrics.pageTransitionHasMinesweeperClass).toBe(false);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.appShellMaxWidth).not.toBe('none');
  expect(metrics.pageTransitionMaxWidth).not.toBe('none');
});
