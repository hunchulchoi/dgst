import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('article list navigation scroll reset', () => {
  it('preserves the current position so the root layout can animate to the top', () => {
    expect(articlePage).toMatch(/replaceState: true,[\s\S]*?noScroll: true/);
    expect(articlePage).not.toContain('function resetViewportScroll()');
    expect(articlePage).not.toContain('resetListPageScrollAfterNavigation');
    expect(articlePage).not.toContain("await invalidate('board-list')");
  });
});
