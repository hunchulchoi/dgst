// @ts-nocheck -- Browser callbacks use runtime DOM types.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 1100 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/games/block-blast');
  await expect(page.getByRole('button', { name: '블록 1', exact: true })).toBeEnabled();
});

test('places blocks, refills the hand, clears a row and persists the best score', async ({
  page
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (let col = 1; col <= 8; col++) {
    await page.getByRole('button', { name: `블록 ${((col - 1) % 3) + 1}`, exact: true }).click();
    await page.getByRole('button', { name: `1행 ${col}열 빈칸`, exact: true }).click();
  }
  await expect(page.locator('.cell.filled')).toHaveCount(0);
  await expect(page.getByTestId('score')).toHaveText('480');
  await expect(page.getByRole('status')).toContainText('ALL CLEAR');
  await page.reload();
  await expect(page.locator('.best')).toHaveText('480');
  await expect(page.getByTestId('score')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('drags a block and rejects occupied placement', async ({ page }) => {
  const shape = await page.locator('.piece-slot').first().locator('.shape').boundingBox();
  const cell = await page.getByRole('button', { name: '3행 3열 빈칸' }).boundingBox();
  await page.mouse.move(shape.x + shape.width / 2, shape.y + shape.height / 2);
  await page.mouse.down();
  await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 12 });
  await expect(page.locator('.cell.preview')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.cell.filled')).toHaveCount(1);
  await expect(page.getByTestId('score')).toHaveText('10');
  await page.getByRole('button', { name: '블록 2', exact: true }).click();
  await page.getByRole('button', { name: '3행 3열 채워짐' }).click();
  await expect(page.getByTestId('score')).toHaveText('10');
  await expect(page.getByRole('status')).toContainText('놓을 수 없어요');
});

test('restart requires confirmation and preserves the best score', async ({ page }) => {
  await page.getByRole('button', { name: '블록 1', exact: true }).click();
  await page.getByRole('button', { name: '1행 1열 빈칸' }).click();
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.getByRole('button', { name: '계속하기' }).click();
  await expect(page.getByTestId('score')).toHaveText('10');
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  await page.locator('.swal2-confirm').click();
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.locator('.cell.filled')).toHaveCount(0);
  await expect(page.locator('.best')).toHaveText('10');
});

test('keyboard selection and placement work', async ({ page }) => {
  await page.getByRole('button', { name: '블록 1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '2행 2열 빈칸' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('score')).toHaveText('10');
});

test('shows ranking, retries a failed save and celebrates first place once', async ({ page }) => {
  const smokeRank = await page.request.get('/games/block-blast?rank=1');
  expect(await smokeRank.json()).toMatchObject({ rank: [], smoke: true });
  let storedScore = 0;
  const submissions = [];
  await page.route('**/games/block-blast*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      submissions.push(body.score);
      if (submissions.length === 1) {
        await route.fulfill({ status: 503, json: { message: 'temporary failure' } });
      } else {
        storedScore = body.score;
        await route.fulfill({ json: { success: true, score: storedScore } });
      }
    } else if (new URL(request.url()).searchParams.has('rank')) {
      const rival = { _id: 'rival@example.test', nickname: '라이벌', score: 100 };
      await route.fulfill({
        json: {
          rank: storedScore
            ? [
                { _id: 'local-game-smoke@dgst.local', nickname: '로컬스모크', score: storedScore },
                rival
              ]
            : [rival],
          myBest: storedScore ? { score: storedScore } : null
        }
      });
    } else {
      await route.continue();
    }
  });
  await page.reload();
  await expect(page.locator('.ranking')).toContainText('라이벌');
  await page.evaluate(() => {
    Math.random = () => 0.6;
  });
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  for (const [i, [row, col]] of [
    [1, 1],
    [1, 4],
    [4, 1],
    [4, 4]
  ].entries()) {
    await page.getByRole('button', { name: `블록 ${(i % 3) + 1}`, exact: true }).click();
    await page.getByRole('button', { name: `${row}행 ${col}열 빈칸`, exact: true }).click();
  }
  await expect(page.getByRole('alert')).toContainText('점수를 저장하지 못했어요');
  await expect(page.locator('.champion')).toHaveCount(0);
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await expect(page.locator('.champion')).toContainText('블록퍼즐 1등');
  await expect(page.locator('.champion-fireworks')).toBeVisible();
  await expect(page.locator('.ranking .game-ranking-row').first()).toContainText('로컬스모크');
  await expect(page.locator('.ranking')).toContainText('내 최고점: 360');
  await page.getByRole('button', { name: '1등 축하 닫기' }).click();
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.locator('.champion')).toHaveCount(0);
  await page.getByRole('button', { name: '다시 도전' }).click();
  await expect(page.getByTestId('score')).toHaveText('0');
  expect(submissions).toEqual([360, 360]);
});

test('shows game over when no remaining block fits and starts a fresh game', async ({ page }) => {
  await page.evaluate(() => {
    Math.random = () => 0.6;
  });
  await page.getByRole('button', { name: '새 게임', exact: true }).click();
  const positions = [
    [1, 1],
    [1, 4],
    [4, 1],
    [4, 4]
  ];
  for (let i = 0; i < positions.length; i++) {
    await page.getByRole('button', { name: `블록 ${(i % 3) + 1}`, exact: true }).click();
    await page
      .getByRole('button', { name: `${positions[i][0]}행 ${positions[i][1]}열 빈칸`, exact: true })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'GAME OVER' })).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('360');
  await page.getByRole('button', { name: '다시 도전' }).click();
  await expect(page.getByTestId('score')).toHaveText('0');
  await expect(page.locator('.cell.filled')).toHaveCount(0);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('rotates a selected block and places the rotated shape', async ({ page }) => {
    const rotate = page.getByRole('button', { name: '↻ 회전', exact: true });
    await expect(rotate).toBeDisabled();
    await page.evaluate(() => {
      Math.random = () => 0.1;
    });
    await page.getByRole('button', { name: '새 게임', exact: true }).tap();
    await page.getByRole('button', { name: '블록 1', exact: true }).tap();
    await rotate.tap();
    await page.getByRole('button', { name: '7행 2열 빈칸', exact: true }).tap();
    await expect(page.getByRole('button', { name: '7행 2열 채워짐' })).toBeVisible();
    await expect(page.getByRole('button', { name: '8행 2열 채워짐' })).toBeVisible();
    await expect(page.getByRole('button', { name: '7행 3열 빈칸' })).toBeVisible();
    await expect(page.getByTestId('score')).toHaveText('20');
    await expect(rotate).toBeDisabled();
  });

  test('touch placement fits the viewport', async ({ page }) => {
    await page.getByRole('button', { name: '블록 1', exact: true }).tap();
    await page.getByRole('button', { name: '1행 1열 빈칸' }).tap();
    await expect(page.getByTestId('score')).toHaveText('10');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test('touch drag places a block', async ({ page, context }) => {
    await page.locator('.piece-slot').first().scrollIntoViewIfNeeded();
    const shape = await page.locator('.shape').first().boundingBox();
    const cell = await page.getByRole('button', { name: '3행 3열 빈칸' }).boundingBox();
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }]
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 }]
    });
    await expect(page.locator('.cell.preview')).toHaveCount(1);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('score')).toHaveText('10');
    await expect(page.locator('.cell.filled')).toHaveCount(1);
  });

  test('touch drag crosses bottom row boundaries smoothly and drops on the last row', async ({
    page,
    context
  }) => {
    await page.locator('.piece-slot').first().scrollIntoViewIfNeeded();
    const shape = await page.locator('.shape').first().boundingBox();
    const first = await page.locator('.cell').first().boundingBox();
    const last = await page.locator('.cell').last().boundingBox();
    const step = (last.x - first.x) / 7;
    const x = first.x + step * 2 + first.width / 2;
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }]
    });
    for (let row = 4; row <= 7; row++) {
      for (const delta of [-2, 2]) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: first.y + step * row + 64 + delta }]
        });
        await expect(page.locator('.cell.preview')).toHaveAttribute(
          'aria-label',
          `${row + (delta > 0 ? 1 : 0)}행 3열 빈칸`
        );
      }
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('button', { name: '8행 3열 채워짐' })).toBeVisible();
    await expect(page.getByTestId('score')).toHaveText('10');
  });
});
