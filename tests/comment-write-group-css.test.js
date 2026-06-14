import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const slotPage = readFileSync('src/routes/games/slot/+page.svelte', 'utf8');

describe('comment write group layout CSS', () => {
  it('keeps textarea and submit button on one input-group row', () => {
    expect(articlePage).toContain(':global(.comment-section .comment-write-group)');
    expect(articlePage).toContain('flex-wrap: nowrap');
    expect(articlePage).toContain('width: 1%');
    expect(articlePage).toContain('flex: 1 1 auto');
  });

  it('renders single-emoji comments at three times the comment text size', () => {
    expect(articlePage).toContain("import { isOnlyOneEmoji } from '$lib/util/emoji.js'");
    expect(articlePage).toContain('{#if isOnlyOneEmoji(comment.content)}');
    expect(articlePage).toContain('class="comment-single-emoji"');
    expect(articlePage).toContain(':global(.dgst-rich-text .comment-single-emoji)');
    expect(articlePage).toContain('zoom: 4.5');
  });

  it('renders single-emoji slot comments at three times the comment text size', () => {
    expect(slotPage).toContain('{#if isOnlyOneEmoji(comment.content)}');
    expect(slotPage).toContain('class="slot-comment-single-emoji"');
    expect(slotPage).toContain(':global(.slot-comment-single-emoji)');
    expect(slotPage).toContain('zoom: 4.5');
  });
});
