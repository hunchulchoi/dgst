// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const articleRepo = vi.hoisted(() => ({
  addRead: vi.fn(),
  findArticleAuthorProfile: vi.fn(),
  findArticleById: vi.fn(),
  recordArticleRead: vi.fn(),
  toArticleJson: vi.fn()
}));

const commentRepo = vi.hoisted(() => ({
  findCommentsByArticle: vi.fn(),
  toCommentJson: vi.fn()
}));

const boardArticleList = vi.hoisted(() => ({
  fetchBoardArticleList: vi.fn()
}));

const boardListLoad = vi.hoisted(() => ({
  computePaginationWindow: vi.fn(),
  getBoardListPayload: vi.fn()
}));

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);
vi.mock('$lib/server/boardArticleList.js', () => boardArticleList);
vi.mock('$lib/server/boardListLoad.js', () => boardListLoad);
vi.mock('$lib/database/prisma.js', () => prismaModule);

describe('board article load comment shape', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));

    articleRepo.findArticleById.mockResolvedValue({
      id: 'article-1',
      email: 'writer@example.com',
      title: 'title',
      content: '<p>body</p>',
      createdAt: new Date('2026-06-14T11:00:00.000Z'),
      updatedAt: new Date('2026-06-14T11:00:00.000Z'),
      likes: []
    });
    articleRepo.addRead.mockResolvedValue(null);
    articleRepo.recordArticleRead.mockResolvedValue(null);
    articleRepo.findArticleAuthorProfile.mockResolvedValue({
      photo: null,
      introduction: ''
    });
    articleRepo.toArticleJson.mockReturnValue({
      _id: 'article-1',
      id: 'article-1',
      email: 'writer@example.com',
      title: 'title',
      nickname: 'writer',
      content: '<p>body</p>',
      like: 0,
      liked: false,
      comments: []
    });
    commentRepo.findCommentsByArticle.mockResolvedValue([
      {
        id: 'comment-1',
        email: 'writer@example.com',
        nickname: 'writer',
        photo: null,
        boardId: 'free',
        articleId: 'article-1',
        parentCommentId: null,
        parentCommentNickname: null,
        depth: 1,
        content: 'hello',
        image: null,
        state: 'write',
        modifiedEmail: null,
        createdAt: new Date('2026-06-14T00:00:00.000Z'),
        updatedAt: new Date('2026-06-14T00:00:00.000Z'),
        likes: []
      },
      {
        id: 'comment-2',
        email: 'reply@example.com',
        nickname: 'reply',
        photo: null,
        boardId: 'free',
        articleId: 'article-1',
        parentCommentId: 'comment-1',
        parentCommentNickname: 'writer',
        depth: 2,
        content: 'reply hello',
        image: null,
        state: 'write',
        modifiedEmail: null,
        createdAt: new Date('2026-06-14T00:01:00.000Z'),
        updatedAt: new Date('2026-06-14T00:01:00.000Z'),
        likes: []
      }
    ]);
    commentRepo.toCommentJson.mockImplementation((comment) => ({
      _id: comment.id,
      id: comment.id,
      email: comment.email,
      nickname: comment.nickname,
      photo: comment.photo,
      boardId: comment.boardId,
      articleId: comment.articleId,
      parentCommentId: comment.parentCommentId,
      parentCommentNickname: comment.parentCommentNickname,
      depth: comment.depth,
      content: comment.content,
      image: comment.image,
      state: comment.state,
      modifiedEmail: comment.modifiedEmail,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      like: comment.likes.length,
      likes: comment.likes
    }));
    boardArticleList.fetchBoardArticleList.mockResolvedValue([]);
    boardListLoad.computePaginationWindow.mockReturnValue({ startNo: 1, endNo: 1 });
    boardListLoad.getBoardListPayload.mockResolvedValue({
      boardId: 'free',
      pageNo: 1,
      maxPage: 1,
      startNo: 1,
      endNo: 1,
      articles: []
    });
    prismaModule.getPrisma.mockReturnValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 절대 조건 회귀 테스트: 게시글 상세도 최근 3일 게시글만 보여야 한다.
  it('NEVER CHANGE: rejects board article detail older than three days', async () => {
    articleRepo.findArticleById.mockResolvedValue({
      id: 'article-1',
      email: 'writer@example.com',
      title: 'old title',
      content: '<p>old body</p>',
      createdAt: new Date('2026-06-11T12:00:00.000Z'),
      updatedAt: new Date('2026-06-11T12:00:00.000Z'),
      likes: []
    });

    const { load } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.server.js');

    await expect(
      load({
        params: { boardId: 'free', articleId: 'article-1', pageNo: '1' },
        locals: { auth: vi.fn().mockResolvedValue(null) },
        cookies: { get: vi.fn().mockReturnValue('device-1') }
      })
    ).rejects.toMatchObject({
      status: 404
    });

    expect(articleRepo.recordArticleRead).not.toHaveBeenCalled();
    expect(commentRepo.findCommentsByArticle).not.toHaveBeenCalled();
  });

  it('returns top-level comments and replies with normalized ids on initial load', async () => {
    const { load } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.server.js');

    const result = await load({
      params: { boardId: 'free', articleId: 'article-1', pageNo: '1' },
      locals: { auth: vi.fn().mockResolvedValue(null) },
      cookies: { get: vi.fn().mockReturnValue('device-1') }
    });

    expect(commentRepo.toCommentJson).toHaveBeenCalledTimes(2);
    expect(result.article.comments).toHaveLength(2);
    expect(result.article.comments).toMatchObject([
      {
        id: 'comment-1',
        _id: 'comment-1',
        depth: 1
      },
      {
        id: 'comment-2',
        _id: 'comment-2',
        parentCommentId: 'comment-1',
        depth: 2
      }
    ]);
  });

  it('updates article read time without adding unread flags to detail comments', async () => {
    articleRepo.recordArticleRead.mockResolvedValue({
      article: {
        id: 'article-1',
        email: 'writer@example.com',
        title: 'title',
        content: '<p>body</p>',
        createdAt: new Date('2026-06-14T11:00:00.000Z'),
        updatedAt: new Date('2026-06-14T11:00:00.000Z'),
        likes: []
      },
      previousReadAt: new Date('2026-06-14T00:00:30.000Z'),
      readAt: new Date('2026-06-14T12:00:00.000Z')
    });

    const { load } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.server.js');

    const result = await load({
      params: { boardId: 'free', articleId: 'article-1', pageNo: '1' },
      locals: { auth: vi.fn().mockResolvedValue({ user: { email: 'viewer@example.com' } }) },
      cookies: { get: vi.fn().mockReturnValue('device-1') }
    });

    expect(articleRepo.recordArticleRead).toHaveBeenCalledWith('article-1', 'viewer@example.com');
    expect(result.article.comments).toMatchObject([
      { id: 'comment-1', depth: 1 },
      { id: 'comment-2', depth: 2 }
    ]);
    expect(result.article.comments[0]).not.toHaveProperty('isNewSinceLastRead');
    expect(result.article.comments[1]).not.toHaveProperty('isNewSinceLastRead');
  });
});
