import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('articleRepo owner helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('loads only selected fields owned article lookup', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'article-1', title: 'title' });
    prismaModule.getPrisma.mockReturnValue({ article: { findFirst } });

    const { findOwnedArticle } = await import('../src/lib/server/board/articleRepo.js');
    const result = await findOwnedArticle({
      id: 'article-1',
      email: 'session@example.com',
      boardId: 'free',
      select: { id: true, title: true }
    });

    expect(result).toEqual({ id: 'article-1', title: 'title' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'article-1', email: 'session@example.com', boardId: 'free', state: 'write' },
      select: { id: true, title: true }
    });
  });

  it('soft deletes an owned article with a single filtered updateMany call', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    prismaModule.getPrisma.mockReturnValue({ article: { updateMany } });

    const { softDeleteArticleByOwner } = await import('../src/lib/server/board/articleRepo.js');
    const result = await softDeleteArticleByOwner('article-1', 'session@example.com', 'free');

    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'article-1', email: 'session@example.com', boardId: 'free', state: 'write' },
      data: { state: 'deleted', modifiedEmail: 'session@example.com' }
    });
  });

  it('records article reads and returns the previous read time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T08:00:00.000Z'));

    const article = { id: 'article-1', reads: ['viewer@example.com'] };
    const previousReadAt = new Date('2026-06-24T07:00:00.000Z');
    const articleFindUnique = vi.fn().mockResolvedValue(article);
    const articleUpdate = vi.fn();
    const readFindUnique = vi.fn().mockResolvedValue({ readAt: previousReadAt });
    const readUpsert = vi.fn().mockResolvedValue({});
    prismaModule.getPrisma.mockReturnValue({
      article: { findUnique: articleFindUnique, update: articleUpdate },
      articleRead: { findUnique: readFindUnique, upsert: readUpsert }
    });

    const { recordArticleRead } = await import('../src/lib/server/board/articleRepo.js');
    const result = await recordArticleRead('article-1', 'viewer@example.com');

    expect(result).toEqual({
      article,
      previousReadAt,
      readAt: new Date('2026-06-24T08:00:00.000Z')
    });
    expect(readFindUnique).toHaveBeenCalledWith({
      where: { articleId_viewerId: { articleId: 'article-1', viewerId: 'viewer@example.com' } },
      select: { readAt: true }
    });
    expect(readUpsert).toHaveBeenCalledWith({
      where: { articleId_viewerId: { articleId: 'article-1', viewerId: 'viewer@example.com' } },
      update: { readAt: new Date('2026-06-24T08:00:00.000Z') },
      create: {
        articleId: 'article-1',
        viewerId: 'viewer@example.com',
        readAt: new Date('2026-06-24T08:00:00.000Z')
      }
    });
  });
});
