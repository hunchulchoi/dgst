import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('article list navigation scroll reset', () => {
  it('owns scroll handling and resets after the destination has rendered', () => {
    expect(articlePage).toContain('async function resetListPageScrollAfterNavigation()');
    expect(articlePage).toMatch(/requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);
    expect(articlePage).toMatch(/replaceState: true,[\s\S]*?noScroll: true/);
    expect(articlePage).toMatch(/await goto\([\s\S]*?await resetListPageScrollAfterNavigation\(\);/);
  });

  it('temporarily overrides Bootstrap smooth scrolling and resets every viewport scroll root', () => {
    expect(articlePage).toContain("document.documentElement.style.scrollBehavior = 'auto'");
    expect(articlePage).toContain('window.scrollTo(0, 0)');
    expect(articlePage).toContain('document.documentElement.scrollTop = 0');
    expect(articlePage).toContain('document.body.scrollTop = 0');
    expect(articlePage).toContain('document.documentElement.style.scrollBehavior = previousScrollBehavior');
  });
});
