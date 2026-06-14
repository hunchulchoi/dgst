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

  it('limits board list loading to articles from the last three days', async () => {
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
      createdAfter: new Date('2026-06-11T12:00:00.000Z')
    });
    expect(result).toMatchObject({
      boardId: 'free',
      pageNo: 1,
      maxPage: 1,
      articles: [{ _id: 'article-1' }, { _id: 'article-2' }]
    });
  });
});
