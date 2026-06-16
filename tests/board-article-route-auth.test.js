// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const articleRepo = vi.hoisted(() => ({
  createArticle: vi.fn(),
  findOwnedArticle: vi.fn(),
  softDeleteArticleByOwner: vi.fn(),
  updateArticleByOwner: vi.fn()
}));

const boardListLoad = vi.hoisted(() => ({
  bustBoardListCache: vi.fn()
}));

const alarmService = vi.hoisted(() => ({
  deleteAlarmsByArticle: vi.fn()
}));

const authCheck = vi.hoisted(() => ({
  checkAndLogSessionDevice: vi.fn()
}));

const sanitizeModule = vi.hoisted(() => ({
  sanitizeArticleContent: vi.fn((value) => value)
}));

const validationModule = vi.hoisted(() => ({
  validateArticleContent: vi.fn(() => ({ ok: true }))
}));

const submitDedup = vi.hoisted(() => ({
  buildSubmitFingerprint: vi.fn(() => 'fp'),
  findRecentDuplicateArticle: vi.fn(),
  tryAcquireSubmitDedup: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    error: vi.fn()
  }
}));

const traceModule = vi.hoisted(() => ({
  traceFromUnknown: vi.fn()
}));

vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/boardListLoad.js', () => boardListLoad);
vi.mock('$lib/server/alarm/alarmService.js', () => alarmService);
vi.mock('$lib/server/auth/checkSessionDevice.js', () => authCheck);
vi.mock('$lib/server/sanitizeArticleContent.js', () => sanitizeModule);
vi.mock('$lib/util/articleContentValidation.js', () => validationModule);
vi.mock('$lib/server/submitDedup.js', () => submitDedup);
vi.mock('$lib/util/logger.js', () => loggerModule);
vi.mock('$lib/util/formatErrorTrace.js', () => traceModule);

describe('board article route auth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses only the authenticated session email when updating an article', async () => {
    articleRepo.updateArticleByOwner.mockResolvedValue({ id: 'article-1' });

    const { actions } =
      await import('../src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.server.js');

    const formData = new FormData();
    formData.set('title', 'title');
    formData.set('content', 'body');
    formData.set('email', 'forged@example.com');

    const result = await actions.default({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { nickname: 'writer', email: 'session@example.com' }
        })
      },
      request: {
        formData: vi.fn().mockResolvedValue(formData)
      }
    });

    expect(articleRepo.updateArticleByOwner).toHaveBeenCalledWith(
      'article-1',
      'session@example.com',
      'free',
      {
        title: 'title',
        content: 'body',
        modifiedEmail: 'session@example.com'
      }
    );
    expect(result).toEqual({ success: true, articleId: 'article-1' });
  });

  it('uses only the authenticated session email when deleting an article', async () => {
    articleRepo.softDeleteArticleByOwner.mockResolvedValue({ count: 1 });

    const { DELETE } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/delete/+server.js');

    const response = await DELETE({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: { nickname: 'writer', email: 'session@example.com' }
        })
      }
    });

    expect(articleRepo.softDeleteArticleByOwner).toHaveBeenCalledWith(
      'article-1',
      'session@example.com',
      'free'
    );
    expect(alarmService.deleteAlarmsByArticle).toHaveBeenCalledWith('article-1');
    expect(response.status).toBe(200);
  });
});
