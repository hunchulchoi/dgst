import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('articleRepo owner helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads only the selected fields for an owned article lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'article-1',
      title: 'title'
    });

    prismaModule.getPrisma.mockReturnValue({
      article: { findFirst }
    });

    const { findOwnedArticle } = await import('../src/lib/server/board/articleRepo.js');

    const result = await findOwnedArticle({
      id: 'article-1',
      email: 'session@example.com',
      boardId: 'free',
      select: { id: true, title: true }
    });

    expect(result).toEqual({
      id: 'article-1',
      title: 'title'
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'article-1',
        email: 'session@example.com',
        boardId: 'free',
        state: 'write'
      },
      select: { id: true, title: true }
    });
  });

  it('soft deletes an owned article with a single filtered updateMany call', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    prismaModule.getPrisma.mockReturnValue({
      article: { updateMany }
    });

    const { softDeleteArticleByOwner } = await import('../src/lib/server/board/articleRepo.js');

    const result = await softDeleteArticleByOwner('article-1', 'session@example.com', 'free');

    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-1',
        email: 'session@example.com',
        boardId: 'free',
        state: 'write'
      },
      data: {
        state: 'deleted',
        modifiedEmail: 'session@example.com'
      }
    });
  });
});
