import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaModule = vi.hoisted(() => ({
  getPrisma: vi.fn()
}));

const loggerModule = vi.hoisted(() => ({
  default: {
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('$lib/database/prisma.js', () => prismaModule);
vi.mock('$lib/util/logger.js', () => loggerModule);

describe('alarmService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts unread alarms by distinct article, not by comment count', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { articleId: 'article-1', commentIds: ['comment-1', 'comment-2'] },
      { articleId: 'article-1', commentIds: ['comment-3'] },
      { articleId: 'article-2', commentIds: ['comment-4'] },
      { articleId: 'article-3', commentIds: [] }
    ]);

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findMany }
    });

    const { getUnreadAlarmCount } = await import('../src/lib/server/alarm/alarmService.js');

    const result = await getUnreadAlarmCount('user@example.com');

    expect(result).toBe(3);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        readAt: null,
        updatedAt: { gte: new Date('2026-06-13T12:00:00.000Z') }
      },
      select: {
        articleId: true,
        commentIds: true
      }
    });
  });

  // 절대 조건 회귀 테스트: 알림 목록은 최근 24시간 내역만 보여야 한다.
  it('NEVER CHANGE: loads only alarms updated within the last 24 hours', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findMany }
    });

    const { getAlarmList } = await import('../src/lib/server/alarm/alarmService.js');

    const result = await getAlarmList('user@example.com');

    expect(result).toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        updatedAt: { gte: new Date('2026-06-13T12:00:00.000Z') }
      },
      orderBy: { updatedAt: 'desc' },
      take: 30
    });
  });

  it('marks only unread alarms for the article and its comment thread ids', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    prismaModule.getPrisma.mockReturnValue({
      alarm: { updateMany }
    });

    const { markAsRead } = await import('../src/lib/server/alarm/alarmService.js');

    await markAsRead('user@example.com', 'article-1');

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        readAt: null,
        OR: [{ id: 'article-1' }, { id: { startsWith: 'article-1_' } }]
      },
      data: {
        readAt: expect.any(Date)
      }
    });
  });

  it('upserts an existing alarm by appending only new comment ids and resetting readAt', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const create = vi.fn();

    prismaModule.getPrisma.mockReturnValue({
      alarm: { updateMany, create }
    });

    const { upsertAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await upsertAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      title: 'title',
      boardId: 'free',
      newCommentId: 'comment-2'
    });

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-1',
        NOT: {
          commentIds: {
            has: 'comment-2'
          }
        }
      },
      data: {
        title: 'title',
        boardId: 'free',
        readAt: null,
        commentIds: {
          push: 'comment-2'
        }
      }
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not duplicate an existing comment id during alarm upsert', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    prismaModule.getPrisma.mockReturnValue({
      alarm: { updateMany, create: vi.fn() }
    });

    const { upsertAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await upsertAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      title: 'title',
      boardId: 'free',
      parentCommentId: 'comment-1',
      newCommentId: 'comment-9'
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'article-1_comment-1',
        NOT: {
          commentIds: {
            has: 'comment-9'
          }
        }
      },
      data: {
        title: 'title',
        boardId: 'free',
        readAt: null,
        commentIds: {
          push: 'comment-9'
        }
      }
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'article-1_comment-1' },
      data: {
        title: 'title',
        boardId: 'free',
        readAt: null
      }
    });
  });

  it('creates a new alarm row when no existing alarm matches the target id', async () => {
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const create = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      alarm: { updateMany, create }
    });

    const { upsertAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await upsertAlarm({
      email: 'owner@example.com',
      articleId: 'article-1',
      title: 'title',
      boardId: 'free',
      parentCommentId: 'comment-1',
      parentCommentContent: 'parent body',
      newCommentId: 'comment-9'
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        id: 'article-1_comment-1',
        email: 'owner@example.com',
        articleId: 'article-1',
        boardId: 'free',
        title: 'title',
        parentCommentId: 'comment-1',
        commentContent: 'parent body',
        commentIds: ['comment-9'],
        readAt: null
      }
    });
  });

  it('removes a comment id from alarm and deletes the alarm when it becomes empty', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1',
      commentIds: ['comment-1']
    });
    const del = vi.fn().mockResolvedValue({});
    const update = vi.fn();

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, delete: del, update }
    });

    const { removeCommentFromAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await removeCommentFromAlarm({
      articleId: 'article-1',
      parentCommentId: null,
      commentId: 'comment-1'
    });

    expect(del).toHaveBeenCalledWith({ where: { id: 'article-1' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the alarm row when other comment ids remain', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-1_comment-1',
      commentIds: ['comment-1', 'comment-2']
    });
    const del = vi.fn();
    const update = vi.fn().mockResolvedValue({});

    prismaModule.getPrisma.mockReturnValue({
      alarm: { findUnique, delete: del, update }
    });

    const { removeCommentFromAlarm } = await import('../src/lib/server/alarm/alarmService.js');

    await removeCommentFromAlarm({
      articleId: 'article-1',
      parentCommentId: 'comment-1',
      commentId: 'comment-2'
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'article-1_comment-1' },
      data: { commentIds: ['comment-1'] }
    });
    expect(del).not.toHaveBeenCalled();
  });
});
