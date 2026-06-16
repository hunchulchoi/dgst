// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const commentRepo = vi.hoisted(() => ({
  createComment: vi.fn(),
  findCommentById: vi.fn(),
  findCommentsByArticle: vi.fn(),
  findOwnedActiveComment: vi.fn(),
  findRecentDuplicateComment: vi.fn(),
  softDeleteComment: vi.fn(),
  toCommentJson: vi.fn(),
  updateComment: vi.fn()
}));

const articleRepo = vi.hoisted(() => ({
  findArticleAlarmTarget: vi.fn()
}));

const alarmService = vi.hoisted(() => ({
  upsertAlarm: vi.fn(),
  markAsRead: vi.fn(),
  removeCommentFromAlarm: vi.fn()
}));

const fileUpload = vi.hoisted(() => ({
  write: vi.fn()
}));

const treeModule = vi.hoisted(() => ({
  default: vi.fn((rows) => rows)
}));

const authCheck = vi.hoisted(() => ({
  checkAndLogSessionDevice: vi.fn()
}));

const logger = vi.hoisted(() => ({
  error: vi.fn()
}));

const formatErrorTrace = vi.hoisted(() => ({
  traceFromUnknown: vi.fn(() => 'trace')
}));

const submitDedup = vi.hoisted(() => ({
  buildSubmitFingerprint: vi.fn(),
  tryAcquireSubmitDedup: vi.fn()
}));

vi.mock('$lib/server/board/commentRepo.js', () => commentRepo);
vi.mock('$lib/server/board/articleRepo.js', () => articleRepo);
vi.mock('$lib/server/alarm/alarmService.js', () => alarmService);
vi.mock('$lib/util/fileUpload.js', () => fileUpload);
vi.mock('$lib/util/tree.js', () => treeModule);
vi.mock('$lib/server/auth/checkSessionDevice.js', () => authCheck);
vi.mock('$lib/util/logger.js', () => ({ default: logger }));
vi.mock('$lib/util/formatErrorTrace.js', () => formatErrorTrace);
vi.mock('$lib/server/submitDedup.js', () => submitDedup);

describe('board comment route auth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the authenticated session email for comment updates', async () => {
    commentRepo.findOwnedActiveComment.mockResolvedValue({ id: 'comment-1' });
    commentRepo.updateComment.mockResolvedValue({});

    const { PUT } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/comment/+server.js');

    const formData = new FormData();
    formData.set('commentId', 'comment-1');
    formData.set('content', 'updated body');
    formData.set('email', 'forged@example.com');

    const response = await PUT({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: {
            nickname: 'session-user',
            email: 'session@example.com'
          }
        })
      },
      request: {
        formData: vi.fn().mockResolvedValue(formData)
      }
    });

    expect(commentRepo.findOwnedActiveComment).toHaveBeenCalledWith({
      id: 'comment-1',
      email: 'session@example.com',
      boardId: 'free',
      articleId: 'article-1',
      select: { id: true }
    });
    expect(commentRepo.updateComment).toHaveBeenCalledWith('comment-1', {
      content: 'updated body',
      modifiedEmail: 'session@example.com'
    });
    expect(response.status).toBe(200);
  });

  it('uses the authenticated session email for comment deletes', async () => {
    commentRepo.findOwnedActiveComment.mockResolvedValue({ id: 'comment-1' });
    commentRepo.softDeleteComment.mockResolvedValue({
      parentCommentId: 'parent-1'
    });

    const { DELETE } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/comment/+server.js');

    const response = await DELETE({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: {
            nickname: 'session-user',
            email: 'session@example.com'
          }
        })
      },
      request: {
        json: vi.fn().mockResolvedValue({
          commentId: 'comment-1',
          email: 'forged@example.com'
        })
      }
    });

    expect(commentRepo.findOwnedActiveComment).toHaveBeenCalledWith({
      id: 'comment-1',
      email: 'session@example.com',
      boardId: 'free',
      articleId: 'article-1',
      select: { id: true }
    });
    expect(commentRepo.softDeleteComment).toHaveBeenCalledWith('comment-1', 'session@example.com');
    expect(alarmService.removeCommentFromAlarm).toHaveBeenCalledWith({
      articleId: 'article-1',
      parentCommentId: 'parent-1',
      commentId: 'comment-1'
    });
    expect(response.status).toBe(200);
  });

  it('clears the existing image when comment edit requests image removal', async () => {
    commentRepo.findOwnedActiveComment.mockResolvedValue({ id: 'comment-1' });
    commentRepo.updateComment.mockResolvedValue({});

    const { PUT } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/comment/+server.js');

    const formData = new FormData();
    formData.set('commentId', 'comment-1');
    formData.set('content', 'updated body');
    formData.set('removeImage', 'true');

    const response = await PUT({
      params: { boardId: 'free', articleId: 'article-1' },
      locals: {
        auth: vi.fn().mockResolvedValue({
          user: {
            nickname: 'session-user',
            email: 'session@example.com'
          }
        })
      },
      request: {
        formData: vi.fn().mockResolvedValue(formData)
      }
    });

    expect(commentRepo.updateComment).toHaveBeenCalledWith('comment-1', {
      content: 'updated body',
      modifiedEmail: 'session@example.com',
      image: null
    });
    expect(response.status).toBe(200);
  });

  it('logs structured errors when comment creation fails', async () => {
    submitDedup.buildSubmitFingerprint.mockReturnValue('fingerprint');
    submitDedup.tryAcquireSubmitDedup.mockResolvedValue(true);
    commentRepo.createComment.mockRejectedValue(new Error('database down'));

    const { POST } =
      await import('../src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/comment/+server.js');

    const formData = new FormData();
    formData.set('content', 'new comment');

    await expect(
      POST({
        params: { boardId: 'free', articleId: 'article-1' },
        locals: {
          auth: vi.fn().mockResolvedValue({
            user: {
              nickname: 'session-user',
              email: 'session@example.com'
            }
          })
        },
        request: {
          formData: vi.fn().mockResolvedValue(formData)
        }
      })
    ).rejects.toMatchObject({ status: 500 });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '[board.comment] create failed',
        boardId: 'free',
        articleId: 'article-1',
        email: 'session@example.com',
        errorMessage: 'database down',
        trace: 'trace'
      })
    );
  });
});
