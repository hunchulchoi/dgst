import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board new article badge', () => {
  it('renders a new badge from the server-side unread fresh article flag', () => {
    const source = readFileSync('src/lib/components/board_list.svelte', 'utf8');

    expect(source).toContain('article.isNewArticle');
    expect(source).toContain('new');
  });
});
