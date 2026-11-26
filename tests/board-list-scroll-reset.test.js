import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('article list navigation scroll reset', () => {
  it('preserves the current position so the root layout can animate to the top', () => {
    // SvelteKit 3: `replace` replaces `replaceState`; `reset: false` keeps scroll like `noScroll`.
    expect(articlePage).toMatch(/replace: true,[\s\S]*?reset: false/);
    expect(articlePage).not.toContain('function resetViewportScroll()');
    expect(articlePage).not.toContain('resetListPageScrollAfterNavigation');
    expect(articlePage).not.toContain("await invalidate('board-list')");
  });

  it('requests mobile width normalization after the list has rendered', () => {
    expect(articlePage).toMatch(
      /await goto\([\s\S]*?window\.dispatchEvent\(new CustomEvent\('dgst:normalize-mobile-layout-width'\)\);/
    );
  });
});
