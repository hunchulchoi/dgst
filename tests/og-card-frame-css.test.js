import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('OG card frame CSS', () => {
  it('draws the card border, radius, and shadow on the outer wrapper', () => {
    expect(articlePage).toContain('.article-content .og-card-blot');
    expect(articlePage).toContain('border: 1px solid var(--bs-border-color)');
    expect(articlePage).toContain('border-radius: 1rem');
    expect(articlePage).toContain('box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28)');
    expect(articlePage).toContain('overflow: hidden');
  });
});
