// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const articleRepo = vi.hoisted(() => ({
  findArticleById: vi.fn(),
  toggleArticleLike: vi.fn()
}));

const commentRepo = vi.hoisted(() => ({
  toggleCommentLike: vi.fn()
}));

vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);

describe('board like route responses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns only like summary fields for article likes', async () => {
    articleRepo.findArticleById.mockResolvedValue({
      id: 'article-1',
      createdAt: new Date(Date.now())
    });
    articleRepo.toggleArticleLike.mockResolvedValue({
      id: 'article-1',
      likes: ['session@example.com', 'other@example.com']
    });

    const { POST } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/like/+server.js');

    const response = await POST({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { nickname: 'writer', email: 'session@example.com' }
        })
      }
    });

    expect(articleRepo.toggleArticleLike).toHaveBeenCalledWith(
      'article-1',
      'session@example.com',
      'like'
    );
    await expect(response.json()).resolves.toEqual({
      like: 2,
      liked: true
    });
  });

  it('returns only like summary fields for comment likes', async () => {
    commentRepo.toggleCommentLike.mockResolvedValue({
      id: 'comment-1',
      boardId: 'free',
      articleId: 'article-1',
      state: 'write',
      likes: ['session@example.com']
    });

    const { POST } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/like/[commentId]/+server.js');

    const response = await POST({
      params: { boardId: 'free', articleId: 'article-1', commentId: 'comment-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { nickname: 'writer', email: 'session@example.com' }
        })
      }
    });

    expect(commentRepo.toggleCommentLike).toHaveBeenCalledWith(
      'comment-1',
      'session@example.com',
      'like'
    );
    await expect(response.json()).resolves.toEqual({
      like: 1,
      liked: true
    });
  });
});
