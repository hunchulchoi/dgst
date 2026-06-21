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

  it('enriches board articles with comment counts, reply-badge freshness, and author photos', async () => {
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
        hasAudio: true,
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
        hasAudio: false,
        hasYoutube: false,
        hasInstagram: true
      }
    ]);
    const userFindMany = vi.fn().mockResolvedValue([
      { email: 'writer1@example.com', photo: '/writer1.jpg' },
      { email: 'writer2@example.com', photo: null }
    ]);
    const articleReadFindMany = vi.fn().mockResolvedValue([
      {
        articleId: 'article-1',
        readAt: new Date('2026-06-14T11:50:00.000Z')
      },
      {
        articleId: 'article-2',
        readAt: new Date('2026-06-14T10:20:00.000Z')
      }
    ]);
    const commentFindMany = vi.fn().mockResolvedValue([]);

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: userFindMany },
      articleRead: { findMany: articleReadFindMany },
      comment: { findMany: commentFindMany }
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
      createdAfter: new Date('2026-06-11T12:00:00.000Z'),
      viewerId: 'viewer@example.com'
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
        hasAudio: true,
        hasYoutube: true,
        hasInstagram: true
      }
    });
    expect(commentRepo.summarizeCommentsByArticles).toHaveBeenCalledWith([
      'article-1',
      'article-2'
    ]);
    expect(articleReadFindMany).toHaveBeenCalledWith({
      where: {
        viewerId: 'viewer@example.com',
        articleId: { in: ['article-1', 'article-2'] }
      },
      select: { articleId: true, readAt: true }
    });
    expect(commentFindMany).toHaveBeenCalledWith({
      where: {
        articleId: { in: ['article-1', 'article-2'] },
        state: 'write',
        NOT: { email: 'viewer@example.com' }
      },
      orderBy: { createdAt: 'desc' },
      select: { articleId: true, createdAt: true }
    });
    expect(result).toMatchObject([
      {
        _id: 'article-1',
        title: 'First',
        read: 2,
        like: 1,
        comment: 3,
        isNewComment: false,
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
    expect(result[0].content).toContain('bi-music-note-beamed');
    expect(result[0].content).toContain('bi-youtube');
    expect(result[1].content).toContain('bi-instagram');
  });

  it('marks comment badges as new when latest non-viewer replies are newer than the viewer read time', async () => {
    const articleFindMany = vi.fn().mockResolvedValue([
      {
        id: 'article-1',
        title: 'Unread replies',
        createdAt: new Date('2026-06-14T11:00:00.000Z'),
        nickname: 'writer1',
        email: 'writer1@example.com',
        reads: ['viewer@example.com'],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasAudio: false,
        hasYoutube: false,
        hasInstagram: false
      },
      {
        id: 'article-2',
        title: 'Only fresh comments',
        createdAt: new Date('2026-06-14T10:00:00.000Z'),
        nickname: 'writer2',
        email: 'writer2@example.com',
        reads: ['viewer@example.com'],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasAudio: false,
        hasYoutube: false,
        hasInstagram: false
      }
    ]);
    const articleReadFindMany = vi.fn().mockResolvedValue([
      {
        articleId: 'article-1',
        readAt: new Date('2026-06-14T04:44:00.000Z')
      },
      {
        articleId: 'article-2',
        readAt: new Date('2026-06-14T05:00:00.000Z')
      }
    ]);
    const commentFindMany = vi.fn().mockResolvedValue([
      {
        articleId: 'article-1',
        createdAt: new Date('2026-06-14T04:46:00.000Z')
      },
      {
        articleId: 'article-2',
        createdAt: new Date('2026-06-14T04:50:00.000Z')
      }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      articleRead: { findMany: articleReadFindMany },
      comment: { findMany: commentFindMany }
    });
    commentRepo.summarizeCommentsByArticles.mockResolvedValue({
      'article-1': {
        count: 2,
        latestCreatedAt: new Date('2026-06-14T08:30:00.000Z')
      },
      'article-2': {
        count: 1,
        latestCreatedAt: new Date('2026-06-14T11:59:00.000Z')
      }
    });

    const { fetchBoardArticleList } = await import('../src/lib/server/boardArticleList.js');

    const result = await fetchBoardArticleList({
      boardId: 'free',
      pageNo: 1,
      pageUnit: 30,
      viewerId: 'viewer@example.com'
    });

    expect(result).toMatchObject([
      { _id: 'article-1', comment: 2, isNewComment: true },
      { _id: 'article-2', comment: 1, isNewComment: false }
    ]);
    expect(commentFindMany).toHaveBeenCalledWith({
      where: {
        articleId: { in: ['article-1', 'article-2'] },
        state: 'write',
        NOT: { email: 'viewer@example.com' }
      },
      orderBy: { createdAt: 'desc' },
      select: { articleId: true, createdAt: true }
    });
  });

  it('marks never-read article comments as new without a daily badge reset cutoff', async () => {
    vi.setSystemTime(new Date('2026-06-14T01:30:00.000Z'));
    const articleFindMany = vi.fn().mockResolvedValue([
      {
        id: 'morning-article',
        title: 'Morning article',
        createdAt: new Date('2026-06-14T01:00:00.000Z'),
        nickname: 'writer',
        email: 'writer@example.com',
        reads: [],
        likes: [],
        hasImage: false,
        hasVideo: false,
        hasAudio: false,
        hasYoutube: false,
        hasInstagram: false
      }
    ]);
    const commentFindMany = vi.fn().mockResolvedValue([
      {
        articleId: 'morning-article',
        createdAt: new Date('2026-06-14T01:10:00.000Z')
      }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      article: { findMany: articleFindMany },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      articleRead: { findMany: vi.fn().mockResolvedValue([]) },
      comment: { findMany: commentFindMany }
    });
    commentRepo.summarizeCommentsByArticles.mockResolvedValue({
      'morning-article': {
        count: 1,
        latestCreatedAt: new Date('2026-06-14T01:10:00.000Z')
      }
    });

    const { fetchBoardArticleList } = await import('../src/lib/server/boardArticleList.js');

    const result = await fetchBoardArticleList({
      boardId: 'free',
      pageNo: 1,
      pageUnit: 30,
      viewerId: 'viewer@example.com'
    });

    expect(commentFindMany).toHaveBeenCalledWith({
      where: {
        articleId: { in: ['morning-article'] },
        state: 'write',
        NOT: { email: 'viewer@example.com' }
      },
      orderBy: { createdAt: 'desc' },
      select: { articleId: true, createdAt: true }
    });
    expect(result).toMatchObject([
      { _id: 'morning-article', comment: 1, isNewArticle: true, isNewComment: true }
    ]);
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
      user: { findMany: vi.fn().mockResolvedValue([]) },
      articleRead: { findMany: vi.fn().mockResolvedValue([]) },
      comment: { findMany: vi.fn().mockResolvedValue([]) }
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
