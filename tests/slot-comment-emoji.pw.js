import { expect, test } from '@playwright/test';

test('single-emoji slot comments render at three times the comment text size', async ({ page }) => {
  await page.route('**/games/slot**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.resourceType() === 'document') {
      await route.continue();
      return;
    }

    if (url.searchParams.has('rank')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ rank: [] })
      });
      return;
    }

    if (url.pathname === '/games/slot/comment') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          comments: [
            {
              id: 'smoke-emoji-comment',
              nickname: 'Smoke',
              content: '😎',
              createdAt: new Date().toISOString(),
              depth: 1
            }
          ],
          page: 1,
          perPage: 50,
          total: 1,
          totalPages: 1,
          hasMore: false
        })
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        balance: 1000,
        oopsInfo: null,
        todayStats: { spins: 0, users: 0 }
      })
    });
  });

  await page.goto('/games/slot');

  const emoji = page.locator('.slot-comment-single-emoji');
  await expect(emoji).toHaveText('😎');

  const sizes = await emoji.evaluate((node) => {
    const parent = node.parentElement;
    if (!parent) throw new Error('Expected emoji comment to have a parent element');

    const rect = node.getBoundingClientRect();

    return {
      emoji: Math.max(rect.width, rect.height),
      parent: Number.parseFloat(getComputedStyle(parent).fontSize)
    };
  });

  expect(sizes.emoji).toBeGreaterThanOrEqual(sizes.parent * 4.4);
});
