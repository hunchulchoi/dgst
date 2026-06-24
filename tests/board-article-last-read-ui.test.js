import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const boardList = readFileSync('src/lib/components/board_list.svelte', 'utf8');

describe('board article last-read UI', () => {
  it('renders unread reply markers only beside board-list titles', () => {
    expect(boardList).toContain('{#if article.isNewComment}');
    expect(boardList).toContain('<Badge color="warning"');

    expect(articlePage).not.toContain('dgst:last-read');
    expect(articlePage).not.toContain('applyGuestLastReadFallback');
    expect(articlePage).not.toContain('comment.isNewSinceLastRead');
    expect(articlePage).not.toContain('comment-new-badge');
    expect(articlePage).not.toContain('>NEW<');
  });
});
