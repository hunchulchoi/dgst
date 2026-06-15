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
        hasImage: true,
        hasVideo: false,
        hasYoutube: true,
        hasInstagram: false
      },
      {
        id: 'article-2',
        title: 'Second',
        createdAt: new Date('2026-06-14T10:00:00.000Z'),
        nickname: 'writer2',
        email: 'writer2@example.com',
        reads: [],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasYoutube: false,
        hasInstagram: true
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
        hasImage: true,
        hasVideo: true,
        hasYoutube: true,
        hasInstagram: true
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
    expect(result[0].content).toContain('bi-youtube');
    expect(result[1].content).toContain('bi-instagram');
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

  it('marks only unread articles created within one hour as new', async () => {
    const articleFindMany = vi.fn().mockResolvedValue([
      {
        id: 'fresh-unread',
        title: 'Fresh unread',
        createdAt: new Date('2026-06-14T11:01:00.000Z'),
        nickname: 'writer1',
        email: 'writer1@example.com',
        reads: [],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasYoutube: false,
        hasInstagram: false
      },
      {
        id: 'fresh-read',
        title: 'Fresh read',
        createdAt: new Date('2026-06-14T11:02:00.000Z'),
        nickname: 'writer2',
        email: 'writer2@example.com',
        reads: ['viewer@example.com'],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasYoutube: false,
        hasInstagram: false
      },
      {
        id: 'old-unread',
        title: 'Old unread',
        createdAt: new Date('2026-06-14T10:59:00.000Z'),
        nickname: 'writer3',
        email: 'writer3@example.com',
        reads: [],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasYoutube: false,
        hasInstagram: false
      },
      {
        id: 'boundary-unread',
        title: 'Boundary unread',
        createdAt: new Date('2026-06-14T11:00:00.000Z'),
        nickname: 'writer4',
        email: 'writer4@example.com',
        reads: [],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasYoutube: false,
        hasInstagram: false
      }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: vi.fn().mockResolvedValue([]) }
    });
    commentRepo.summarizeCommentsByArticles.mockResolvedValue({});

    const { fetchBoardArticleList } = await import('../src/lib/server/boardArticleList.js');

    const result = await fetchBoardArticleList({
      boardId: 'free',
      pageNo: 1,
      pageUnit: 30,
      viewerId: 'viewer@example.com'
    });

    expect(result).toMatchObject([
      { _id: 'fresh-unread', isNewArticle: true },
      { _id: 'fresh-read', isNewArticle: false },
      { _id: 'old-unread', isNewArticle: false },
      { _id: 'boundary-unread', isNewArticle: false }
    ]);
  });
});
