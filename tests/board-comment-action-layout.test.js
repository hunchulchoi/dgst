import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('board comment action layout', () => {
  it('keeps article action buttons left aligned on desktop', () => {
    expect(articlePage).toContain('class="article-toolbar text-start pe-md-3 p-xs-0 m-xs-0"');
    expect(articlePage).toContain('class="article-toolbar text-start pe-1"');
    expect(articlePage).toMatch(
      /:global\(\.article-toolbar\)\s*\{[^}]*justify-content: flex-start;/
    );
    expect(articlePage).not.toContain('class="article-toolbar text-end');
  });

  it('keeps comment action buttons left aligned on desktop', () => {
    expect(articlePage).toContain('class="comment-actions text-start pe-2 m-0"');
    expect(articlePage).toMatch(
      /:global\(\.comment-actions\)\s*\{[^}]*justify-content: flex-start;/
    );
    expect(articlePage).not.toContain('class="comment-actions text-end pe-2 m-0"');
  });

  it('keeps upload controls close to the left edge and submit buttons right aligned', () => {
    expect(articlePage.match(/class="comment-attachment-group mb-2"/g)).toHaveLength(3);
    expect(articlePage).toContain('class="comment-file-input form-control"');
    expect(articlePage).toContain(':global(.comment-section .comment-file-input)');
    expect(articlePage).toContain('max-width: min(18rem, 55vw);');
    expect(articlePage).toContain(':global(.comment-section .comment-write-group)');
    expect(articlePage).toContain('flex-direction: column;');
    expect(articlePage).toContain('max-width: min(44rem, 100%);');
    expect(articlePage).toContain(':global(.comment-section .comment-write-group .comment-form-btn)');
    expect(articlePage).toContain('align-self: flex-end;');
    expect(articlePage).toContain('margin-top: 0;');
    expect(articlePage).not.toContain('gap: 0.45rem;\n    width: 100%;\n    max-width: min(44rem, 100%);');
  });
});
