import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('commentRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads only the selected fields for an owned active comment lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'comment-1'
    });

    prismaModule.getPrisma.mockReturnValue({
      comment: { findFirst }
    });

    const { findOwnedActiveComment } = await import('../src/lib/server/board/commentRepo.js');

    const result = await findOwnedActiveComment({
      id: 'comment-1',
      email: 'user@example.com',
      boardId: 'free',
      articleId: 'article-1',
      select: { id: true }
    });

    expect(result).toEqual({ id: 'comment-1' });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'comment-1',
        email: 'user@example.com',
        boardId: 'free',
        articleId: 'article-1',
        state: 'write'
      },
      select: { id: true }
    });
  });

  it('passes through a select object for article comment list lookups', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'comment-1' }]);

    prismaModule.getPrisma.mockReturnValue({
      comment: { findMany }
    });

    const { findCommentsByArticle } = await import('../src/lib/server/board/commentRepo.js');

    const result = await findCommentsByArticle('article-1', 'free', { id: true, likes: true });

    expect(result).toEqual([{ id: 'comment-1' }]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        articleId: 'article-1',
        boardId: 'free'
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, likes: true }
    });
  });

  it('summarizes comment counts and latest timestamps in one grouped query', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      {
        articleId: 'article-1',
        _count: { _all: 3 },
        _max: { createdAt: new Date('2026-06-14T11:45:00.000Z') }
      },
      {
        articleId: 'article-2',
        _count: { _all: 1 },
        _max: { createdAt: new Date('2026-06-14T10:15:00.000Z') }
      }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      comment: { groupBy }
    });

    const { summarizeCommentsByArticles } = await import('../src/lib/server/board/commentRepo.js');

    const result = await summarizeCommentsByArticles(['article-1', 'article-2']);

    expect(result).toEqual({
      'article-1': {
        count: 3,
        latestCreatedAt: new Date('2026-06-14T11:45:00.000Z')
      },
      'article-2': {
        count: 1,
        latestCreatedAt: new Date('2026-06-14T10:15:00.000Z')
      }
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['articleId'],
      where: {
        articleId: { in: ['article-1', 'article-2'] },
        state: 'write'
      },
      _count: { _all: true },
      _max: { createdAt: true }
    });
  });
});
