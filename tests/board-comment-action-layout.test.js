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
    expect(articlePage).toContain('flex-wrap: nowrap;');
    expect(articlePage).toContain('align-items: stretch;');
    expect(articlePage).toContain('max-width: min(44rem, 100%);');
    expect(articlePage).toContain(':global(.comment-section .comment-write-group .comment-form-btn)');
    expect(articlePage).toContain('align-self: stretch;');
    expect(articlePage).toContain('min-width: 6.25rem;');
    expect(articlePage).toContain('width: auto;');
    expect(articlePage).toMatch(
      /:global\(\.comment-section \.comment-write-group\)\s*\{[^}]*flex-wrap: nowrap;[^}]*align-items: stretch;/
    );
  });

  it('uses mobile-specific compact comment and article controls', () => {
    expect(articlePage).toContain('class="article-action-label"');
    expect(articlePage).toMatch(
      /@media \(max-width: 767\.98px\) \{[\s\S]*:global\(\.comment-actions\) \{[\s\S]*justify-content: flex-end;/
    );
    expect(articlePage).toContain(':global(.article-toolbar .article-action-label)');
    expect(articlePage).toContain('display: none;');
    expect(articlePage).toContain(':global(.comment-section .comment-attachment-group)');
    expect(articlePage).toContain('flex-wrap: nowrap;');
    expect(articlePage).toContain('max-width: min(14rem, 58vw);');
  });

  it('left aligns comment refresh controls on desktop and scrolls near reply start', () => {
    expect(articlePage).toContain('bind:this={commentSectionEl}');
    expect(articlePage).toContain('async function refreshCommentsFromToolbar()');
    expect(articlePage).toContain('scrollToCommentSectionStart()');
    expect(articlePage).toContain('COMMENT_SECTION_SCROLL_OFFSET = 24');
    expect(articlePage).toContain('commentSectionEl.getBoundingClientRect().top + window.scrollY');
    expect(articlePage).toContain("onclick={refreshCommentsFromToolbar}");
    expect(articlePage).toContain(
      'class="text-start article-comment-refresh d-flex align-items-center justify-content-start"'
    );
    expect(articlePage).toContain(
      'class="text-start d-flex align-items-center justify-content-start article-comment-refresh"'
    );
  });

  it('shows a preparing message while initial comments are being prepared', () => {
    expect(articlePage).toContain("let initialCommentLoading = $state(true);");
    expect(articlePage).toContain('댓글을 준비하고 있습니다');
    expect(articlePage).toContain('{#if initialCommentLoading}');
    expect(articlePage).toContain('initialCommentLoading = false;');
  });

  it('scrolls near the newly created comment after saving', () => {
    expect(articlePage).toContain('function scrollToCreatedComment(commentId)');
    expect(articlePage).toContain('document.getElementById(`cmt${commentId}`)');
    expect(articlePage).toContain("block: 'center'");
    expect(articlePage).toContain('const createdCommentId = createdCommentBody?.id;');
    expect(articlePage).toContain('scrollToCreatedComment(createdCommentId);');
    expect(articlePage).toMatch(/await comments\(\);[\s\S]*scrollToCreatedComment\(createdCommentId\);/);
  });

  it('scrolls near the edited comment after saving an edit', () => {
    expect(articlePage).toContain('const editedCommentId = editingCommentId;');
    expect(articlePage).toMatch(/cancelEditComment\(\);[\s\S]*await comments\(\);[\s\S]*scrollToCreatedComment\(editedCommentId\);/);
  });
});
