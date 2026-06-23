import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);
const writePage = readFileSync(
  'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte',
  'utf8'
);
const slotPage = readFileSync('src/routes/games/slot/+page.svelte', 'utf8');

/**
 * @param {string} source
 * @param {string} selector
 */
const cssBlock = (source, selector) => {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
};

describe('comment write group layout CSS', () => {
  it('keeps textarea submit button on one input-group row', () => {
    expect(articlePage).toContain(':global(.comment-section .comment-write-group)');
    expect(articlePage).toContain('flex-wrap: nowrap');
    expect(articlePage).toContain('width: 1%');
    expect(articlePage).toContain('flex: 1 1 auto');
  });

  it('keeps board comment textarea 16px only on mobile to prevent focus zoom', () => {
    expect(cssBlock(articlePage, ':global(.comment-section .comment-write-group textarea)')).not.toContain(
      'font-size: 16px'
    );
    expect(articlePage).toMatch(
      /@media \(max-width: 767\.98px\)\s*\{[^]*:global\(\.comment-section \.comment-write-group textarea\)\s*\{[^}]*font-size:\s*16px/
    );
  });

  it('keeps board write title input 16px only on mobile to prevent focus zoom', () => {
    expect(cssBlock(writePage, ':global(.write-title-field > .form-control)')).not.toContain(
      'font-size: 16px'
    );
    expect(writePage).toMatch(
      /@media \(max-width: 575\.98px\)\s*\{[^]*:global\(\.write-title-field > \.form-control\)\s*\{[^}]*font-size:\s*16px/
    );
  });

  it('renders single-emoji comments at three times comment text size', () => {
    expect(articlePage).toContain("import { isOnlyOneEmoji } from '$lib/util/emoji.js'");
    expect(articlePage).toContain('{#if isOnlyOneEmoji(comment.content)}');
    expect(articlePage).toContain('class="comment-single-emoji"');
    expect(articlePage).toContain(':global(.dgst-rich-text .comment-single-emoji)');
    expect(articlePage).toContain('zoom: 4.5');
  });

  it('renders single-emoji slot comments at three times comment text size', () => {
    expect(slotPage).toContain('{#if isOnlyOneEmoji(comment.content)}');
    expect(slotPage).toContain('class="slot-comment-single-emoji"');
    expect(slotPage).toContain(':global(.slot-comment-single-emoji)');
    expect(slotPage).toContain('zoom: 4.5');
  });
});
