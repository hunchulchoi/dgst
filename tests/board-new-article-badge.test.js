import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board new article badge', () => {
  it('renders a new badge beside the existing article badges, not beside the title', () => {
    const source = readFileSync('src/lib/components/board_list.svelte', 'utf8');

    expect(source).toContain('article.isNewArticle');
    expect(source).toContain('new');
    expect(source.indexOf('{#if article.isNewArticle}')).toBeGreaterThan(
      source.indexOf('{#if article.comment}')
    );
  });
});
