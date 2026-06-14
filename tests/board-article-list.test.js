import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

const commentRepo = vi.hoisted(() => ({
  summarizeCommentsByArticles: vi.fn()
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);

describe('fetchBoardArticleList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enriches board articles with comment counts, latest-comment freshness, and author photos', async () => {
    const articleFindMany = vi.fn().mockResolvedValue([
      {
        id: 'article-1',
        title: 'First',
        createdAt: new Date('2026-06-14T11:00:00.000Z'),
        nickname: 'writer1',
        email: 'writer1@example.com',
        reads: ['a', 'b'],
        likes: ['x'],
        content: '<p>hello <img src="/a.jpg" /></p>'
      },
      {
        id: 'article-2',
        title: 'Second',
        createdAt: new Date('2026-06-14T10:00:00.000Z'),
        nickname: 'writer2',
        email: 'writer2@example.com',
        reads: [],
        likes: [],
        content: '<p>plain text</p>'
      }
    ]);
    const userFindMany = vi.fn().mockResolvedValue([
      { email: 'writer1@example.com', photo: '/writer1.jpg' },
      { email: 'writer2@example.com', photo: null }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: userFindMany }
    });
    commentRepo.summarizeCommentsByArticles.mockResolvedValue({
      'article-1': {
        count: 3,
        latestCreatedAt: new Date('2026-06-14T11:45:00.000Z')
      },
      'article-2': {
        count: 0,
        latestCreatedAt: new Date('2026-06-14T10:15:00.000Z')
      }
    });

    const { fetchBoardArticleList } = await import('../src/lib/server/boardArticleList.js');

    const result = await fetchBoardArticleList({
      boardId: 'free',
      pageNo: 2,
      pageUnit: 30,
      createdAfter: new Date('2026-06-11T12:00:00.000Z')
    });

    expect(articleFindMany).toHaveBeenCalledWith({
      where: {
        boardId: 'free',
        state: 'write',
        createdAt: { gt: new Date('2026-06-11T12:00:00.000Z') }
      },
      orderBy: { createdAt: 'desc' },
      skip: 30,
      take: 30,
      select: {
        id: true,
        title: true,
        createdAt: true,
        nickname: true,
        email: true,
        reads: true,
        likes: true,
        content: true
      }
    });
    expect(commentRepo.summarizeCommentsByArticles).toHaveBeenCalledWith([
      'article-1',
      'article-2'
    ]);
    expect(result).toMatchObject([
      {
        _id: 'article-1',
        title: 'First',
        read: 2,
        like: 1,
        comment: 3,
        isNewComment: true,
        photo: '/writer1.jpg'
      },
      {
        _id: 'article-2',
        title: 'Second',
        read: 0,
        like: 0,
        comment: 0,
        isNewComment: false
      }
    ]);
    expect(result[0].content).toContain('bi-card-image');
  });

  it('returns early without fan-out queries when there are no board rows', async () => {
    const articleFindMany = vi.fn().mockResolvedValue([]);
    const userFindMany = vi.fn();

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: userFindMany }
    });

    const { fetchBoardArticleList } = await import('../src/lib/server/boardArticleList.js');

    const result = await fetchBoardArticleList({
      boardId: 'free',
      pageNo: 1,
      pageUnit: 30
    });

    expect(result).toEqual([]);
    expect(commentRepo.summarizeCommentsByArticles).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });
});
