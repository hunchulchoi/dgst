import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('board article last-read UI', () => {
  it('renders new-comment badges and keeps a guest localStorage fallback', () => {
    expect(articlePage).toContain('dgst:last-read');
    expect(articlePage).toContain('applyGuestLastReadFallback');
    expect(articlePage).toContain('comment.isNewSinceLastRead');
    expect(articlePage).toContain('NEW');
  });
});
