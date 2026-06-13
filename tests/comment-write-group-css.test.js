import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('comment write group layout CSS', () => {
  it('keeps textarea and submit button on one input-group row', () => {
    expect(articlePage).toContain(':global(.comment-section .comment-write-group)');
    expect(articlePage).toContain('flex-wrap: nowrap');
    expect(articlePage).toContain('width: 1%');
    expect(articlePage).toContain('flex: 1 1 auto');
  });
});
