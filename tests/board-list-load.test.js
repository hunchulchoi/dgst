// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const articleRepo = vi.hoisted(() => ({
  countArticles: vi.fn()
}));

const boardArticleList = vi.hoisted(() => ({
  fetchBoardArticleList: vi.fn()
}));

const pgCache = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  getJson: vi.fn(),
  setJson: vi.fn(),
  del: vi.fn(),
  delByPrefix: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/boardArticleList.js', () => boardArticleList);
vi.mock('$lib/server/cache/pgCache.js', () => pgCache);
vi.mock('$lib/util/logger.js', () => loggerModule);

describe('loadBoardList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    pgCache.get.mockResolvedValue(null);
    pgCache.set.mockResolvedValue(undefined);
    pgCache.setJson.mockResolvedValue(undefined);
    pgCache.getJson.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 절대 조건 회귀 테스트: 게시글 목록은 최근 3일 게시글만 보여야 한다.
  it('NEVER CHANGE: limits board list loading to articles from the last three days', async () => {
    articleRepo.countArticles.mockResolvedValue(2);
    boardArticleList.fetchBoardArticleList.mockResolvedValue([
      { _id: 'article-1' },
      { _id: 'article-2' }
    ]);

    const { loadBoardList } = await import('../src/lib/server/boardListLoad.js');

    const result = await loadBoardList(
      {
        depends: vi.fn(),
        params: { pageNo: '1' },
        url: new URL('https://dgst.me/board/free')
      },
      'free'
    );

    expect(articleRepo.countArticles).toHaveBeenCalledWith({
      boardId: 'free',
      state: 'write',
      createdAt: { gt: new Date('2026-06-11T12:00:00.000Z') }
    });
    expect(boardArticleList.fetchBoardArticleList).toHaveBeenCalledWith({
      boardId: 'free',
      pageNo: 1,
      pageUnit: 30,
      createdAfter: new Date('2026-06-11T12:00:00.000Z'),
      viewerId: undefined
    });
    expect(result).toMatchObject({
      boardId: 'free',
      pageNo: 1,
      maxPage: 1,
      articles: [{ _id: 'article-1' }, { _id: 'article-2' }]
    });
  });

  it('passes the authenticated user email as the board list viewer id', async () => {
    articleRepo.countArticles.mockResolvedValue(1);
    boardArticleList.fetchBoardArticleList.mockResolvedValue([{ _id: 'article-1' }]);

    const { loadBoardList } = await import('../src/lib/server/boardListLoad.js');

    await loadBoardList(
      {
        depends: vi.fn(),
        locals: {
          auth: vi.fn().mockResolvedValue({ user: { email: 'viewer@example.com' } })
        },
        cookies: { get: vi.fn() },
        params: { pageNo: '1' },
        url: new URL('https://dgst.me/board/free')
      },
      'free'
    );

    expect(boardArticleList.fetchBoardArticleList).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: 'viewer@example.com'
      })
    );
  });

  it('falls back to the device cookie as the board list viewer id when auth fails', async () => {
    articleRepo.countArticles.mockResolvedValue(1);
    boardArticleList.fetchBoardArticleList.mockResolvedValue([{ _id: 'article-1' }]);

    const { loadBoardList } = await import('../src/lib/server/boardListLoad.js');

    await loadBoardList(
      {
        depends: vi.fn(),
        locals: {
          auth: vi.fn().mockRejectedValue(new Error('auth unavailable'))
        },
        cookies: { get: vi.fn().mockReturnValue('device-1') },
        params: { pageNo: '1' },
        url: new URL('https://dgst.me/board/free')
      },
      'free'
    );

    expect(boardArticleList.fetchBoardArticleList).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: 'device-1'
      })
    );
  });

  it('uses the request-local device id when the device cookie was just created', async () => {
    articleRepo.countArticles.mockResolvedValue(1);
    boardArticleList.fetchBoardArticleList.mockResolvedValue([{ _id: 'article-1' }]);

    const { loadBoardList } = await import('../src/lib/server/boardListLoad.js');

    await loadBoardList(
      {
        depends: vi.fn(),
        locals: {
          auth: vi.fn().mockResolvedValue(null),
          deviceId: 'fresh-device-1'
        },
        cookies: { get: vi.fn().mockReturnValue(undefined) },
        params: { pageNo: '1' },
        url: new URL('https://dgst.me/board/free')
      },
      'free'
    );

    expect(boardArticleList.fetchBoardArticleList).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: 'fresh-device-1'
      })
    );
  });
});
