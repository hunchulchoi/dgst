import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const articlePage = readFileSync(
  'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte',
  'utf8'
);

describe('board comment action layout', () => {
  it('keeps article action buttons right aligned on desktop', () => {
    expect(articlePage).toContain('class="article-toolbar text-end pe-md-3 p-xs-0 m-xs-0"');
    expect(articlePage).toContain('class="article-toolbar text-end pe-1"');
    expect(articlePage).toMatch(
      /:global\(\.article-toolbar\)\s*\{[^}]*justify-content: flex-end;/
    );
    expect(articlePage).not.toContain('class="article-toolbar text-start');
  });

  it('keeps comment action buttons right aligned within a capped comment width', () => {
    expect(articlePage).toContain('class="comment-actions text-end pe-2 m-0"');
    expect(articlePage).toContain(':global(.comment-section)');
    expect(articlePage).toContain(':global(.comment-heading-bar)');
    expect(articlePage).toContain('max-width: min(48rem, 100%);');
    expect(articlePage).toMatch(
      /:global\(\.comment-actions\)\s*\{[^}]*justify-content: flex-end;/
    );
    expect(articlePage).not.toContain('class="comment-actions text-start pe-2 m-0"');
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

  it('keeps mobile icon-only buttons large enough to tap', () => {
    expect(articlePage).toMatch(
      /@media \(max-width: 767\.98px\) \{[\s\S]*:global\(\.article-toolbar \.article-action-btn\) \{[\s\S]*display: inline-flex;[\s\S]*min-height: 44px;[\s\S]*min-width: 44px;/
    );
    expect(articlePage).toMatch(
      /@media \(max-width: 767\.98px\) \{[\s\S]*:global\(\.comment-section \.comment-action-btn\),[\s\S]*:global\(\.comment-section \.comment-form-btn\),[\s\S]*:global\(\.comment-section \.comment-toolbar-btn\) \{[\s\S]*display: inline-flex;[\s\S]*min-height: 44px;[\s\S]*min-width: 44px;/
    );
  });

  it('keeps reply comment action buttons outside the reply indentation on mobile', () => {
    expect(articlePage).toContain("class=\"mt-2 comment-actions-row {comment.parentCommentId ? 'comment-actions-row-reply' : ''}\"");
    expect(articlePage).toContain(':global(.comment-actions-row-reply)');
    expect(articlePage).toContain('margin-left: calc(-1 * var(--reply-comment-indent));');
    expect(articlePage).toContain('width: calc(100% + var(--reply-comment-indent));');
    expect(articlePage).toMatch(
      /@media \(max-width: 767\.98px\) \{[\s\S]*:global\(\.comment-actions-row-reply\) \{[\s\S]*margin-left: calc\(-1 \* var\(--reply-comment-mobile-indent\)\);[\s\S]*width: calc\(100% \+ var\(--reply-comment-mobile-indent\)\);/
    );
  });

  it('scrolls to the comment heading after refreshing comments from the toolbar', () => {
    expect(articlePage).toContain('bind:this={commentSectionEl}');
    expect(articlePage).toContain('async function scrollToCommentSectionStartAfterRender()');
    expect(articlePage).toContain('await tick();');
    expect(articlePage).toContain('requestAnimationFrame(resolve)');
    expect(articlePage).toContain("document.querySelector('.top-comment-heading-bar')");
    expect(articlePage).toContain('topCommentHeadingEl ?? commentSectionEl');
    expect(articlePage).toContain('top-comment-heading-bar');
    expect(articlePage).toContain("behavior: 'smooth'");
    expect(articlePage).toContain('async function refreshCommentsFromToolbar()');
    expect(articlePage).toMatch(
      /await comments\(\);[\s\S]*await scrollToCommentSectionStartAfterRender\(\);/
    );
    expect(articlePage).not.toContain('const scrollY = browser ? window.scrollY : 0;');
    expect(articlePage).toContain("onclick={refreshCommentsFromToolbar}");
    expect(articlePage).toContain(
      'class="text-end article-comment-refresh d-flex align-items-center justify-content-end"'
    );
    expect(articlePage).toContain(
      'class="text-end d-flex align-items-center justify-content-end article-comment-refresh"'
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
